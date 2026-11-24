// litesvm's failure type is large and outside our control.
#![allow(clippy::result_large_err)]

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use litesvm::LiteSVM;
use litesvm_token::{CreateAccount, CreateMint, MintTo};
use selvedge_mandate::error::MandateError;
use selvedge_mandate::state::Mandate;
use selvedge_mandate::{accounts, instruction, LimitParams};
use solana_address::Address;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub const PROGRAM_BINARY_PATH: &str = "../../target/deploy/selvedge_mandate.so";
pub const STARTING_LAMPORTS: u64 = 10_000_000_000;
pub const TOKEN_DECIMALS: u8 = 6;
pub const OWNER_STARTING_TOKENS: u64 = 1_000_000_000;
pub const DEFAULT_PERIOD_CAP: u64 = 5_000_000;
pub const DEFAULT_PERIOD_SECONDS: i64 = 86_400;
pub const DEFAULT_TOOL_ID: u64 = 1;
pub const SECOND_TOOL_ID: u64 = 2;
pub const UNLISTED_TOOL_ID: u64 = 99;
pub const DEFAULT_MANDATE_ID: u64 = 7;
pub const START_TIMESTAMP: i64 = 1_800_000_000;
pub const ONE_DAY_SECONDS: i64 = 86_400;
pub const MANDATE_LIFETIME_SECONDS: i64 = 30 * ONE_DAY_SECONDS;

pub struct Fixture {
    pub svm: LiteSVM,
    pub owner: Keypair,
    pub agent: Keypair,
    pub security_authority: Keypair,
    pub payee_owner: Keypair,
    pub mint: Address,
    pub owner_token_account: Address,
    pub payee_token_account: Address,
    pub mandate: Address,
    pub token_program: Address,
}

pub fn token_program_address() -> Address {
    litesvm_token::TOKEN_ID
}

pub fn mandate_address(owner: &Address, mandate_id: u64) -> Address {
    Address::find_program_address(
        &[
            selvedge_mandate::MANDATE_SEED,
            owner.as_ref(),
            &mandate_id.to_le_bytes(),
        ],
        &selvedge_mandate::ID,
    )
    .0
}

pub fn default_params(fixture_payee_owner: &Address, token_program: &Address) -> LimitParams {
    LimitParams {
        period_cap: DEFAULT_PERIOD_CAP,
        period_seconds: DEFAULT_PERIOD_SECONDS,
        expiry: START_TIMESTAMP + MANDATE_LIFETIME_SECONDS,
        allowed_programs: vec![*token_program],
        allowed_payees: vec![*fixture_payee_owner],
        allowed_tools: vec![DEFAULT_TOOL_ID, SECOND_TOOL_ID],
    }
}

pub fn set_unix_timestamp(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock = svm.get_sysvar::<anchor_lang::prelude::Clock>();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
}

pub fn error_code(error: MandateError) -> u32 {
    anchor_lang::error::ERROR_CODE_OFFSET + error as u32
}

pub fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    extra_signers: &[&Keypair],
    instructions: &[anchor_lang::solana_program::instruction::Instruction],
) -> Result<TransactionMetadata, FailedTransactionMetadata> {
    svm.expire_blockhash();
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let transaction = Transaction::new_signed_with_payer(
        instructions,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(transaction)
}

pub fn assert_mandate_error(
    outcome: Result<TransactionMetadata, FailedTransactionMetadata>,
    expected: MandateError,
) {
    let failure = outcome.expect_err("the transaction must be rejected");
    let expected_code = error_code(expected);
    let message = format!("{:?}", failure.err);
    assert!(
        message.contains(&format!("Custom({expected_code})")),
        "expected mandate error code {expected_code}, got {message}\nlogs: {:?}",
        failure.meta.logs
    );
}

pub fn create_mandate_instruction(
    owner: &Address,
    mandate_id: u64,
    agent: &Address,
    security_authority: &Address,
    mint: &Address,
    params: LimitParams,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::CreateMandate {
            owner: *owner,
            mandate: mandate_address(owner, mandate_id),
            system_program: solana_address::Address::default(),
        }
        .to_account_metas(None),
        data: instruction::CreateMandate {
            mandate_id,
            agent: *agent,
            security_authority: *security_authority,
            mint: *mint,
            params,
        }
        .data(),
    }
}

pub fn spend_instruction(
    fixture: &Fixture,
    agent: &Address,
    amount: u64,
    tool_id: u64,
    expected_nonce: u64,
) -> anchor_lang::solana_program::instruction::Instruction {
    spend_instruction_with_accounts(
        fixture,
        agent,
        amount,
        tool_id,
        expected_nonce,
        &fixture.owner_token_account,
        &fixture.payee_token_account,
        &fixture.token_program,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn spend_instruction_with_accounts(
    fixture: &Fixture,
    agent: &Address,
    amount: u64,
    tool_id: u64,
    expected_nonce: u64,
    owner_token_account: &Address,
    payee_token_account: &Address,
    token_program: &Address,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::Spend {
            agent: *agent,
            mandate: fixture.mandate,
            mint: fixture.mint,
            owner_token_account: *owner_token_account,
            payee_token_account: *payee_token_account,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: instruction::Spend {
            amount,
            tool_id,
            expected_nonce,
        }
        .data(),
    }
}

pub fn revoke_instruction(
    fixture: &Fixture,
    signer: &Address,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::RevokeMandate {
            signer: *signer,
            mandate: fixture.mandate,
        }
        .to_account_metas(None),
        data: instruction::RevokeMandate {}.data(),
    }
}

pub fn update_limits_instruction(
    fixture: &Fixture,
    signer: &Address,
    params: LimitParams,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::UpdateLimits {
            signer: *signer,
            mandate: fixture.mandate,
        }
        .to_account_metas(None),
        data: instruction::UpdateLimits { params }.data(),
    }
}

pub fn rotate_agent_instruction(
    fixture: &Fixture,
    signer: &Address,
    new_agent: &Address,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::RotateAgent {
            signer: *signer,
            mandate: fixture.mandate,
        }
        .to_account_metas(None),
        data: instruction::RotateAgent {
            new_agent: *new_agent,
        }
        .data(),
    }
}

pub fn close_instruction(
    fixture: &Fixture,
    signer: &Address,
) -> anchor_lang::solana_program::instruction::Instruction {
    anchor_lang::solana_program::instruction::Instruction {
        program_id: selvedge_mandate::ID,
        accounts: accounts::CloseMandate {
            owner: *signer,
            mandate: fixture.mandate,
        }
        .to_account_metas(None),
        data: instruction::CloseMandate {}.data(),
    }
}

pub fn read_mandate(svm: &LiteSVM, mandate: &Address) -> Mandate {
    let account = svm
        .get_account(mandate)
        .expect("the mandate account must exist");
    Mandate::try_deserialize(&mut account.data.as_slice()).expect("the account must decode")
}

pub fn token_balance(svm: &LiteSVM, token_account: &Address) -> u64 {
    let account = svm
        .get_account(token_account)
        .expect("the token account must exist");
    let amount_bytes: [u8; 8] = account.data[64..72]
        .try_into()
        .expect("token amount is eight bytes");
    u64::from_le_bytes(amount_bytes)
}

pub fn delegate_to_mandate(fixture: &mut Fixture, amount: u64) {
    litesvm_token::Approve::new(
        &mut fixture.svm,
        &fixture.owner,
        &fixture.mandate,
        &fixture.owner_token_account,
        amount,
    )
    .owner(&fixture.owner.insecure_clone())
    .send()
    .expect("the owner approves the mandate as token delegate");
}

pub fn fixture_with_params(params_builder: impl Fn(&Address, &Address) -> LimitParams) -> Fixture {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(selvedge_mandate::ID, PROGRAM_BINARY_PATH)
        .expect("run `anchor build` before the program tests");
    set_unix_timestamp(&mut svm, START_TIMESTAMP);

    let owner = Keypair::new();
    let agent = Keypair::new();
    let security_authority = Keypair::new();
    let payee_owner = Keypair::new();
    for funded in [&owner, &agent, &security_authority, &payee_owner] {
        svm.airdrop(&funded.pubkey(), STARTING_LAMPORTS)
            .expect("airdrop");
    }

    let mint = CreateMint::new(&mut svm, &owner)
        .decimals(TOKEN_DECIMALS)
        .send()
        .expect("create mint");
    let owner_token_account = CreateAccount::new(&mut svm, &owner, &mint)
        .owner(&owner.pubkey())
        .send()
        .expect("create owner token account");
    let payee_token_account = CreateAccount::new(&mut svm, &owner, &mint)
        .owner(&payee_owner.pubkey())
        .send()
        .expect("create payee token account");
    MintTo::new(
        &mut svm,
        &owner,
        &mint,
        &owner_token_account,
        OWNER_STARTING_TOKENS,
    )
    .send()
    .expect("mint starting tokens");

    let token_program = token_program_address();
    let mandate = mandate_address(&owner.pubkey(), DEFAULT_MANDATE_ID);
    let params = params_builder(&payee_owner.pubkey(), &token_program);
    let create = create_mandate_instruction(
        &owner.pubkey(),
        DEFAULT_MANDATE_ID,
        &agent.pubkey(),
        &security_authority.pubkey(),
        &mint,
        params,
    );
    send(&mut svm, &owner, &[], &[create]).expect("create the mandate");

    Fixture {
        svm,
        owner,
        agent,
        security_authority,
        payee_owner,
        mint,
        owner_token_account,
        payee_token_account,
        mandate,
        token_program,
    }
}

pub fn standard_fixture() -> Fixture {
    let mut fixture = fixture_with_params(default_params);
    delegate_to_mandate(&mut fixture, OWNER_STARTING_TOKENS);
    fixture
}
