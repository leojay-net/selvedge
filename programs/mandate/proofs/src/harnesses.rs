use crate::logic::constants::{MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS};
use crate::logic::error::MandateRejection;
use crate::logic::policy::{
    authorize_agent_rotation, authorize_limit_update, authorize_revoke, authorize_spend,
    roll_period,
};
use crate::logic::state::{KeyAllowlist, LimitUpdate, MandateState, SpendRequest, ToolAllowlist};

const SEQUENCE_LENGTH: usize = 3;
const MAX_TIMESTAMP: i64 = 1 << 33;
const MIN_PERIOD_SECONDS: i64 = 60;
const MAX_PERIOD_SECONDS: i64 = 31_536_000;

fn any_key_allowlist<const CAPACITY: usize>() -> KeyAllowlist<CAPACITY> {
    let allowlist = KeyAllowlist::<CAPACITY> {
        entries: kani::any(),
        length: kani::any(),
    };
    kani::assume(allowlist.length as usize <= CAPACITY);
    allowlist
}

fn any_tool_allowlist() -> ToolAllowlist {
    let allowlist = ToolAllowlist {
        entries: kani::any(),
        length: kani::any(),
    };
    kani::assume(allowlist.length as usize <= MAX_ALLOWED_TOOLS);
    allowlist
}

fn any_state() -> MandateState {
    MandateState {
        owner: kani::any(),
        agent: kani::any(),
        security_authority: kani::any(),
        period_cap: kani::any(),
        period_seconds: kani::any(),
        period_start: kani::any(),
        spent_in_period: kani::any(),
        expiry: kani::any(),
        revoked: kani::any(),
        nonce: kani::any(),
        allowed_programs: any_key_allowlist::<MAX_ALLOWED_PROGRAMS>(),
        allowed_payees: any_key_allowlist::<MAX_ALLOWED_PAYEES>(),
        allowed_tools: any_tool_allowlist(),
    }
}

fn any_well_formed_state() -> MandateState {
    let state = any_state();
    kani::assume(state.spent_in_period <= state.period_cap);
    kani::assume(state.period_seconds >= MIN_PERIOD_SECONDS);
    kani::assume(state.period_seconds <= MAX_PERIOD_SECONDS);
    kani::assume(state.period_start >= 0 && state.period_start < MAX_TIMESTAMP);
    state
}

fn any_request() -> SpendRequest {
    SpendRequest {
        signer: kani::any(),
        amount: kani::any(),
        tool_id: kani::any(),
        program: kani::any(),
        payee: kani::any(),
        expected_nonce: kani::any(),
    }
}

fn any_limit_update() -> LimitUpdate {
    LimitUpdate {
        period_cap: kani::any(),
        period_seconds: kani::any(),
        expiry: kani::any(),
        allowed_programs: any_key_allowlist::<MAX_ALLOWED_PROGRAMS>(),
        allowed_payees: any_key_allowlist::<MAX_ALLOWED_PAYEES>(),
        allowed_tools: any_tool_allowlist(),
    }
}

#[kani::proof]
#[kani::unwind(34)]
fn spend_never_exceeds_cap() {
    let state = any_well_formed_state();
    let request = any_request();
    let now: i64 = kani::any();
    if let Ok(next) = authorize_spend(&state, &request, now) {
        assert!(next.spent_in_period <= next.period_cap);
        assert!(next.nonce == state.nonce + 1);
    }
}

#[kani::proof]
#[kani::unwind(34)]
fn revoked_mandate_authorizes_nothing() {
    let mut state = any_state();
    state.revoked = true;
    let request = any_request();
    let now: i64 = kani::any();
    assert!(authorize_spend(&state, &request, now) == Err(MandateRejection::Revoked));
    let update = any_limit_update();
    let signer: [u8; 32] = kani::any();
    assert!(authorize_limit_update(&state, &signer, &update, now).is_err());
    let new_agent: [u8; 32] = kani::any();
    assert!(authorize_agent_rotation(&state, &signer, &new_agent).is_err());
}

#[kani::proof]
#[kani::unwind(34)]
fn expired_mandate_authorizes_nothing() {
    let state = any_state();
    let request = any_request();
    let now: i64 = kani::any();
    kani::assume(now >= state.expiry);
    assert!(authorize_spend(&state, &request, now).is_err());
}

#[kani::proof]
#[kani::unwind(34)]
fn spend_logic_never_panics_for_any_input() {
    let state = any_state();
    let request = any_request();
    let now: i64 = kani::any();
    let _ = authorize_spend(&state, &request, now);
    let _ = roll_period(&state, now);
}

#[kani::proof]
#[kani::unwind(34)]
fn management_logic_never_panics_for_any_input() {
    let state = any_state();
    let signer: [u8; 32] = kani::any();
    let new_agent: [u8; 32] = kani::any();
    let update = any_limit_update();
    let now: i64 = kani::any();
    let _ = authorize_revoke(&state, &signer);
    let _ = authorize_limit_update(&state, &signer, &update, now);
    let _ = authorize_agent_rotation(&state, &signer, &new_agent);
}

#[kani::proof]
#[kani::unwind(34)]
fn period_rollover_never_resets_spend_inside_the_same_period() {
    let state = any_well_formed_state();
    let now: i64 = kani::any();
    kani::assume(now >= 0 && now < MAX_TIMESTAMP);
    let period_end = state.period_start + state.period_seconds;
    kani::assume(now < period_end);
    let rolled = roll_period(&state, now).unwrap();
    assert!(rolled.spent_in_period == state.spent_in_period);
    assert!(rolled.period_start == state.period_start);
}

#[kani::proof]
#[kani::unwind(34)]
fn period_rollover_window_contains_now_after_roll() {
    let state = any_well_formed_state();
    let now: i64 = kani::any();
    kani::assume(now >= state.period_start && now < MAX_TIMESTAMP);
    let rolled = roll_period(&state, now).unwrap();
    assert!(rolled.period_start <= now);
    assert!(now < rolled.period_start + rolled.period_seconds);
}

#[kani::proof]
#[kani::unwind(34)]
fn authorized_spend_requires_every_allowlist() {
    let state = any_state();
    let request = any_request();
    let now: i64 = kani::any();
    if authorize_spend(&state, &request, now).is_ok() {
        assert!(state.allowed_programs.contains(&request.program));
        assert!(state.allowed_payees.contains(&request.payee));
        assert!(state.allowed_tools.contains(request.tool_id));
        assert!(request.signer == state.agent);
        assert!(!state.revoked);
    }
}

#[kani::proof]
#[kani::unwind(34)]
fn only_owner_changes_limits_and_only_owner_or_security_revokes() {
    let state = any_state();
    let signer: [u8; 32] = kani::any();
    let update = any_limit_update();
    let new_agent: [u8; 32] = kani::any();
    let now: i64 = kani::any();
    if authorize_limit_update(&state, &signer, &update, now).is_ok() {
        assert!(signer == state.owner);
    }
    if authorize_agent_rotation(&state, &signer, &new_agent).is_ok() {
        assert!(signer == state.owner);
    }
    if authorize_revoke(&state, &signer).is_ok() {
        assert!(signer == state.owner || signer == state.security_authority);
    }
}

#[kani::proof]
#[kani::unwind(34)]
fn bounded_sequence_of_operations_preserves_the_cap_invariant() {
    let mut state = any_well_formed_state();
    let mut step_index = 0;
    while step_index < SEQUENCE_LENGTH {
        let now: i64 = kani::any();
        kani::assume(now >= 0 && now < MAX_TIMESTAMP);
        let operation: u8 = kani::any();
        if operation % 2 == 0 {
            let request = any_request();
            if let Ok(next) = authorize_spend(&state, &request, now) {
                state = next;
            }
        } else {
            let signer: [u8; 32] = kani::any();
            let update = any_limit_update();
            kani::assume(update.period_seconds <= MAX_PERIOD_SECONDS);
            if let Ok(next) = authorize_limit_update(&state, &signer, &update, now) {
                state = next;
            }
        }
        assert!(state.spent_in_period <= state.period_cap);
        step_index += 1;
    }
}
