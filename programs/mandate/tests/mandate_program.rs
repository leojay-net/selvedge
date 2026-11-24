// litesvm's failure type is large and outside our control.
#![allow(clippy::result_large_err)]

mod support;

use litesvm_token::{CreateAccount, MintTo};
use selvedge_mandate::error::MandateError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use support::*;

fn agent_pubkey(fixture: &Fixture) -> solana_address::Address {
    fixture.agent.pubkey()
}

fn spend_as_agent(
    fixture: &mut Fixture,
    amount: u64,
    tool_id: u64,
    expected_nonce: u64,
) -> Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata> {
    let instruction = spend_instruction(
        fixture,
        &agent_pubkey(fixture),
        amount,
        tool_id,
        expected_nonce,
    );
    let agent = fixture.agent.insecure_clone();
    send(&mut fixture.svm, &agent, &[], &[instruction])
}

#[test]
fn create_mandate_stores_the_requested_limits() {
    let fixture = standard_fixture();
    let mandate = read_mandate(&fixture.svm, &fixture.mandate);
    assert_eq!(mandate.owner, fixture.owner.pubkey());
    assert_eq!(mandate.agent, fixture.agent.pubkey());
    assert_eq!(
        mandate.security_authority,
        fixture.security_authority.pubkey()
    );
    assert_eq!(mandate.mint, fixture.mint);
    assert_eq!(mandate.period_cap, DEFAULT_PERIOD_CAP);
    assert_eq!(mandate.spent_in_period, 0);
    assert_eq!(mandate.nonce, 0);
    assert!(!mandate.revoked);
    assert_eq!(mandate.allowed_tool_count, 2);
    assert_eq!(mandate.period_start, START_TIMESTAMP);
}

#[test]
fn create_mandate_rejects_zero_cap() {
    let mut fixture = standard_fixture();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.period_cap = 0;
    let instruction = create_mandate_instruction(
        &fixture.owner.pubkey(),
        DEFAULT_MANDATE_ID + 1,
        &fixture.agent.pubkey(),
        &fixture.security_authority.pubkey(),
        &fixture.mint,
        params,
    );
    let owner = fixture.owner.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[instruction]),
        MandateError::InvalidCap,
    );
}

#[test]
fn create_mandate_rejects_out_of_range_period() {
    let mut fixture = standard_fixture();
    for invalid_period in [0, 59, 31_536_001] {
        let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
        params.period_seconds = invalid_period;
        let instruction = create_mandate_instruction(
            &fixture.owner.pubkey(),
            DEFAULT_MANDATE_ID + 2,
            &fixture.agent.pubkey(),
            &fixture.security_authority.pubkey(),
            &fixture.mint,
            params,
        );
        let owner = fixture.owner.insecure_clone();
        assert_mandate_error(
            send(&mut fixture.svm, &owner, &[], &[instruction]),
            MandateError::InvalidPeriod,
        );
    }
}

#[test]
fn create_mandate_rejects_past_expiry() {
    let mut fixture = standard_fixture();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.expiry = START_TIMESTAMP;
    let instruction = create_mandate_instruction(
        &fixture.owner.pubkey(),
        DEFAULT_MANDATE_ID + 3,
        &fixture.agent.pubkey(),
        &fixture.security_authority.pubkey(),
        &fixture.mint,
        params,
    );
    let owner = fixture.owner.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[instruction]),
        MandateError::InvalidExpiry,
    );
}

#[test]
fn create_mandate_rejects_empty_and_oversized_allowlists() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();

    let mut empty_tools = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    empty_tools.allowed_tools = vec![];
    let mut oversized_payees =
        default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    oversized_payees.allowed_payees = vec![fixture.payee_owner.pubkey(); 5];

    for (offset, params) in [(4u64, empty_tools), (5u64, oversized_payees)] {
        let instruction = create_mandate_instruction(
            &fixture.owner.pubkey(),
            DEFAULT_MANDATE_ID + offset,
            &fixture.agent.pubkey(),
            &fixture.security_authority.pubkey(),
            &fixture.mint,
            params,
        );
        assert_mandate_error(
            send(&mut fixture.svm, &owner, &[], &[instruction]),
            MandateError::InvalidAllowlist,
        );
    }
}

#[test]
fn create_mandate_rejects_the_owner_as_agent() {
    let mut fixture = standard_fixture();
    let params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    let instruction = create_mandate_instruction(
        &fixture.owner.pubkey(),
        DEFAULT_MANDATE_ID + 6,
        &fixture.owner.pubkey(),
        &fixture.security_authority.pubkey(),
        &fixture.mint,
        params,
    );
    let owner = fixture.owner.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[instruction]),
        MandateError::InvalidAgent,
    );
}

#[test]
fn spend_moves_tokens_and_advances_the_nonce() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, 1_000_000, DEFAULT_TOOL_ID, 0).expect("spend within cap");
    let mandate = read_mandate(&fixture.svm, &fixture.mandate);
    assert_eq!(mandate.spent_in_period, 1_000_000);
    assert_eq!(mandate.nonce, 1);
    assert_eq!(
        token_balance(&fixture.svm, &fixture.payee_token_account),
        1_000_000
    );
    assert_eq!(
        token_balance(&fixture.svm, &fixture.owner_token_account),
        OWNER_STARTING_TOKENS - 1_000_000
    );
}

#[test]
fn spend_exactly_at_the_cap_passes_and_one_more_unit_fails() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, DEFAULT_PERIOD_CAP, DEFAULT_TOOL_ID, 0)
        .expect("spending exactly the cap passes");
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 1),
        MandateError::CapExceeded,
    );
}

#[test]
fn spend_of_cap_plus_one_in_a_single_call_fails() {
    let mut fixture = standard_fixture();
    assert_mandate_error(
        spend_as_agent(&mut fixture, DEFAULT_PERIOD_CAP + 1, DEFAULT_TOOL_ID, 0),
        MandateError::CapExceeded,
    );
    assert_eq!(token_balance(&fixture.svm, &fixture.payee_token_account), 0);
}

#[test]
fn cumulative_spends_cannot_cross_the_cap() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, 3_000_000, DEFAULT_TOOL_ID, 0).expect("first spend");
    assert_mandate_error(
        spend_as_agent(&mut fixture, 2_000_001, DEFAULT_TOOL_ID, 1),
        MandateError::CapExceeded,
    );
    spend_as_agent(&mut fixture, 2_000_000, SECOND_TOOL_ID, 1)
        .expect("second spend reaches the cap");
}

#[test]
fn period_rollover_resets_spend_only_after_the_period_ends() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, DEFAULT_PERIOD_CAP, DEFAULT_TOOL_ID, 0).expect("fill the period");

    set_unix_timestamp(
        &mut fixture.svm,
        START_TIMESTAMP + DEFAULT_PERIOD_SECONDS - 1,
    );
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 1),
        MandateError::CapExceeded,
    );

    set_unix_timestamp(&mut fixture.svm, START_TIMESTAMP + DEFAULT_PERIOD_SECONDS);
    spend_as_agent(&mut fixture, 1_000, DEFAULT_TOOL_ID, 1).expect("new period allows spend");
    let mandate = read_mandate(&fixture.svm, &fixture.mandate);
    assert_eq!(mandate.spent_in_period, 1_000);
    assert_eq!(
        mandate.period_start,
        START_TIMESTAMP + DEFAULT_PERIOD_SECONDS
    );
}

#[test]
fn skipped_periods_align_the_window_to_the_original_cadence() {
    let mut fixture = standard_fixture();
    set_unix_timestamp(
        &mut fixture.svm,
        START_TIMESTAMP + 3 * DEFAULT_PERIOD_SECONDS + 500,
    );
    spend_as_agent(&mut fixture, 10, DEFAULT_TOOL_ID, 0).expect("spend after skipped periods");
    let mandate = read_mandate(&fixture.svm, &fixture.mandate);
    assert_eq!(
        mandate.period_start,
        START_TIMESTAMP + 3 * DEFAULT_PERIOD_SECONDS
    );
}

#[test]
fn revoked_mandate_rejects_every_spend() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let revoke = revoke_instruction(&fixture, &owner.pubkey());
    send(&mut fixture.svm, &owner, &[], &[revoke]).expect("owner revokes");
    assert!(read_mandate(&fixture.svm, &fixture.mandate).revoked);
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 0),
        MandateError::Revoked,
    );
}

#[test]
fn security_authority_can_revoke_and_a_stranger_cannot() {
    let mut fixture = standard_fixture();
    let stranger = Keypair::new();
    fixture
        .svm
        .airdrop(&stranger.pubkey(), STARTING_LAMPORTS)
        .expect("airdrop");
    let stranger_revoke = revoke_instruction(&fixture, &stranger.pubkey());
    assert_mandate_error(
        send(&mut fixture.svm, &stranger, &[], &[stranger_revoke]),
        MandateError::UnauthorizedSigner,
    );

    let security = fixture.security_authority.insecure_clone();
    let revoke = revoke_instruction(&fixture, &security.pubkey());
    send(&mut fixture.svm, &security, &[], &[revoke]).expect("security authority revokes");
    assert!(read_mandate(&fixture.svm, &fixture.mandate).revoked);
}

#[test]
fn revoking_twice_is_rejected() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let first = revoke_instruction(&fixture, &owner.pubkey());
    send(&mut fixture.svm, &owner, &[], &[first]).expect("first revoke");
    let second = revoke_instruction(&fixture, &owner.pubkey());
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[second]),
        MandateError::AlreadyRevoked,
    );
}

#[test]
fn expired_mandate_rejects_spend() {
    let mut fixture = standard_fixture();
    set_unix_timestamp(&mut fixture.svm, START_TIMESTAMP + MANDATE_LIFETIME_SECONDS);
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 0),
        MandateError::Expired,
    );
}

#[test]
fn tool_outside_the_allowlist_is_rejected() {
    let mut fixture = standard_fixture();
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, UNLISTED_TOOL_ID, 0),
        MandateError::ToolNotAllowed,
    );
}

#[test]
fn payee_outside_the_allowlist_is_rejected() {
    let mut fixture = standard_fixture();
    let stranger = Keypair::new();
    let stranger_token_account =
        CreateAccount::new(&mut fixture.svm, &fixture.owner, &fixture.mint)
            .owner(&stranger.pubkey())
            .send()
            .expect("stranger token account");
    let instruction = spend_instruction_with_accounts(
        &fixture,
        &fixture.agent.pubkey(),
        1,
        DEFAULT_TOOL_ID,
        0,
        &fixture.owner_token_account,
        &stranger_token_account,
        &fixture.token_program,
    );
    let agent = fixture.agent.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &agent, &[], &[instruction]),
        MandateError::PayeeNotAllowed,
    );
}

#[test]
fn token_program_outside_the_allowlist_is_rejected() {
    let mut fixture = standard_fixture();
    let token_2022_program =
        solana_address::Address::from_str_const("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    let instruction = spend_instruction_with_accounts(
        &fixture,
        &fixture.agent.pubkey(),
        1,
        DEFAULT_TOOL_ID,
        0,
        &fixture.owner_token_account,
        &fixture.payee_token_account,
        &token_2022_program,
    );
    let agent = fixture.agent.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &agent, &[], &[instruction]),
        MandateError::ProgramNotAllowed,
    );
}

#[test]
fn a_signer_other_than_the_agent_cannot_spend() {
    let mut fixture = standard_fixture();
    let intruder = Keypair::new();
    fixture
        .svm
        .airdrop(&intruder.pubkey(), STARTING_LAMPORTS)
        .expect("airdrop");
    let instruction = spend_instruction(&fixture, &intruder.pubkey(), 1, DEFAULT_TOOL_ID, 0);
    assert_mandate_error(
        send(&mut fixture.svm, &intruder, &[], &[instruction]),
        MandateError::UnauthorizedSigner,
    );
}

#[test]
fn the_owner_cannot_spend_through_the_agent_path() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let instruction = spend_instruction(&fixture, &owner.pubkey(), 1, DEFAULT_TOOL_ID, 0);
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[instruction]),
        MandateError::UnauthorizedSigner,
    );
}

#[test]
fn spend_without_the_agent_signature_fails() {
    let mut fixture = standard_fixture();
    let fee_payer = fixture.owner.insecure_clone();
    let instruction = spend_instruction(&fixture, &fixture.agent.pubkey(), 1, DEFAULT_TOOL_ID, 0);
    let message = solana_message::Message::new(&[instruction], Some(&fee_payer.pubkey()));
    let mut transaction = solana_transaction::Transaction::new_unsigned(message);
    transaction.partial_sign(&[&fee_payer], fixture.svm.latest_blockhash());
    let outcome = fixture.svm.send_transaction(transaction);
    assert!(
        outcome.is_err(),
        "a spend without the agent signature must fail"
    );
    assert_eq!(token_balance(&fixture.svm, &fixture.payee_token_account), 0);
}

#[test]
fn zero_amount_is_rejected() {
    let mut fixture = standard_fixture();
    assert_mandate_error(
        spend_as_agent(&mut fixture, 0, DEFAULT_TOOL_ID, 0),
        MandateError::ZeroAmount,
    );
}

#[test]
fn replaying_a_spend_with_a_used_nonce_is_rejected() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, 100, DEFAULT_TOOL_ID, 0).expect("first spend");
    assert_mandate_error(
        spend_as_agent(&mut fixture, 100, DEFAULT_TOOL_ID, 0),
        MandateError::StaleNonce,
    );
    assert_eq!(
        token_balance(&fixture.svm, &fixture.payee_token_account),
        100
    );
}

#[test]
fn a_future_nonce_is_rejected() {
    let mut fixture = standard_fixture();
    assert_mandate_error(
        spend_as_agent(&mut fixture, 100, DEFAULT_TOOL_ID, 5),
        MandateError::StaleNonce,
    );
}

#[test]
fn spend_overflow_is_a_typed_rejection_not_a_panic() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.period_cap = u64::MAX;
    let update = update_limits_instruction(&fixture, &owner.pubkey(), params);
    send(&mut fixture.svm, &owner, &[], &[update]).expect("raise the cap");
    MintTo::new(
        &mut fixture.svm,
        &fixture.owner,
        &fixture.mint,
        &fixture.owner_token_account,
        u64::MAX - OWNER_STARTING_TOKENS,
    )
    .send()
    .expect("mint the remainder");
    delegate_to_mandate(&mut fixture, u64::MAX);
    spend_as_agent(&mut fixture, u64::MAX, DEFAULT_TOOL_ID, 0).expect("spend the maximum");
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 1),
        MandateError::ArithmeticOverflow,
    );
}

#[test]
fn spend_fails_when_the_owner_has_not_delegated_enough_tokens() {
    let mut fixture = fixture_with_params(default_params);
    delegate_to_mandate(&mut fixture, 500);
    spend_as_agent(&mut fixture, 500, DEFAULT_TOOL_ID, 0).expect("spend within delegation");
    let outcome = spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 1);
    assert!(
        outcome.is_err(),
        "spend beyond the token delegation must fail"
    );
    assert_eq!(read_mandate(&fixture.svm, &fixture.mandate).nonce, 1);
}

#[test]
fn spend_from_a_token_account_the_owner_does_not_hold_is_rejected() {
    let mut fixture = standard_fixture();
    let stranger = Keypair::new();
    let stranger_token_account =
        CreateAccount::new(&mut fixture.svm, &fixture.owner, &fixture.mint)
            .owner(&stranger.pubkey())
            .send()
            .expect("stranger token account");
    let instruction = spend_instruction_with_accounts(
        &fixture,
        &fixture.agent.pubkey(),
        1,
        DEFAULT_TOOL_ID,
        0,
        &stranger_token_account,
        &fixture.payee_token_account,
        &fixture.token_program,
    );
    let agent = fixture.agent.insecure_clone();
    assert_mandate_error(
        send(&mut fixture.svm, &agent, &[], &[instruction]),
        MandateError::TokenAccountOwnerMismatch,
    );
}

#[test]
fn only_the_owner_can_update_limits() {
    let mut fixture = standard_fixture();
    let agent = fixture.agent.insecure_clone();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.period_cap = u64::MAX;
    let widening = update_limits_instruction(&fixture, &agent.pubkey(), params.clone());
    assert_mandate_error(
        send(&mut fixture.svm, &agent, &[], &[widening]),
        MandateError::UnauthorizedSigner,
    );
    let security = fixture.security_authority.insecure_clone();
    let security_widening = update_limits_instruction(&fixture, &security.pubkey(), params);
    assert_mandate_error(
        send(&mut fixture.svm, &security, &[], &[security_widening]),
        MandateError::UnauthorizedSigner,
    );
    assert_eq!(
        read_mandate(&fixture.svm, &fixture.mandate).period_cap,
        DEFAULT_PERIOD_CAP
    );
}

#[test]
fn owner_can_lower_the_cap_and_the_new_cap_binds() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.period_cap = 1_000;
    let update = update_limits_instruction(&fixture, &owner.pubkey(), params);
    send(&mut fixture.svm, &owner, &[], &[update]).expect("owner lowers the cap");
    assert_mandate_error(
        spend_as_agent(&mut fixture, 1_001, DEFAULT_TOOL_ID, 0),
        MandateError::CapExceeded,
    );
    spend_as_agent(&mut fixture, 1_000, DEFAULT_TOOL_ID, 0).expect("spend at the lowered cap");
}

#[test]
fn lowering_the_cap_below_the_amount_already_spent_is_rejected() {
    let mut fixture = standard_fixture();
    spend_as_agent(&mut fixture, 4_000_000, DEFAULT_TOOL_ID, 0).expect("spend");
    let owner = fixture.owner.insecure_clone();
    let mut params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    params.period_cap = 3_999_999;
    let update = update_limits_instruction(&fixture, &owner.pubkey(), params);
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[update]),
        MandateError::CapBelowSpent,
    );
}

#[test]
fn a_revoked_mandate_cannot_be_updated_or_rotated() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let revoke = revoke_instruction(&fixture, &owner.pubkey());
    send(&mut fixture.svm, &owner, &[], &[revoke]).expect("revoke");
    let params = default_params(&fixture.payee_owner.pubkey(), &fixture.token_program);
    let update = update_limits_instruction(&fixture, &owner.pubkey(), params);
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[update]),
        MandateError::Revoked,
    );
    let replacement = Keypair::new();
    let rotate = rotate_agent_instruction(&fixture, &owner.pubkey(), &replacement.pubkey());
    assert_mandate_error(
        send(&mut fixture.svm, &owner, &[], &[rotate]),
        MandateError::Revoked,
    );
}

#[test]
fn rotating_the_agent_invalidates_the_old_key_and_the_old_nonce() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let replacement = Keypair::new();
    fixture
        .svm
        .airdrop(&replacement.pubkey(), STARTING_LAMPORTS)
        .expect("airdrop");
    let rotate = rotate_agent_instruction(&fixture, &owner.pubkey(), &replacement.pubkey());
    send(&mut fixture.svm, &owner, &[], &[rotate]).expect("owner rotates the agent");

    assert_mandate_error(
        spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 1),
        MandateError::UnauthorizedSigner,
    );
    let stale = spend_instruction(&fixture, &replacement.pubkey(), 1, DEFAULT_TOOL_ID, 0);
    assert_mandate_error(
        send(&mut fixture.svm, &replacement, &[], &[stale]),
        MandateError::StaleNonce,
    );
    let fresh = spend_instruction(&fixture, &replacement.pubkey(), 1, DEFAULT_TOOL_ID, 1);
    send(&mut fixture.svm, &replacement, &[], &[fresh]).expect("new agent spends");
}

#[test]
fn only_the_owner_can_rotate_the_agent() {
    let mut fixture = standard_fixture();
    let agent = fixture.agent.insecure_clone();
    let attacker_key = Keypair::new();
    let rotate = rotate_agent_instruction(&fixture, &agent.pubkey(), &attacker_key.pubkey());
    assert_mandate_error(
        send(&mut fixture.svm, &agent, &[], &[rotate]),
        MandateError::UnauthorizedSigner,
    );
}

#[test]
fn closed_mandate_cannot_be_reused() {
    let mut fixture = standard_fixture();
    let owner = fixture.owner.insecure_clone();
    let close = close_instruction(&fixture, &owner.pubkey());
    send(&mut fixture.svm, &owner, &[], &[close]).expect("owner closes the mandate");
    assert!(
        fixture
            .svm
            .get_account(&fixture.mandate)
            .map(|account| account.lamports == 0 || account.data.is_empty())
            .unwrap_or(true),
        "the closed account must be empty"
    );
    let outcome = spend_as_agent(&mut fixture, 1, DEFAULT_TOOL_ID, 0);
    assert!(
        outcome.is_err(),
        "a closed mandate must not authorise spend"
    );
}

#[test]
fn only_the_owner_can_close_the_mandate() {
    let mut fixture = standard_fixture();
    let agent = fixture.agent.insecure_clone();
    let close = close_instruction(&fixture, &agent.pubkey());
    let outcome = send(&mut fixture.svm, &agent, &[], &[close]);
    assert!(outcome.is_err(), "a non-owner must not close the mandate");
    assert!(fixture.svm.get_account(&fixture.mandate).is_some());
}
