use cvlr::prelude::*;

use crate::logic::policy::authorize_spend;
use crate::logic::state::{KeyAllowlist, MandateState, SpendRequest, ToolAllowlist};

fn nondet_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    let mut byte_index = 0;
    while byte_index < 32 {
        key[byte_index] = nondet();
        byte_index += 1;
    }
    key
}

fn nondet_key_allowlist<const CAPACITY: usize>() -> KeyAllowlist<CAPACITY> {
    let mut entries = [[0u8; 32]; CAPACITY];
    let mut entry_index = 0;
    while entry_index < CAPACITY {
        entries[entry_index] = nondet_key();
        entry_index += 1;
    }
    KeyAllowlist {
        entries,
        length: nondet(),
    }
}

fn nondet_tool_allowlist() -> ToolAllowlist {
    let mut entries = [0u64; 8];
    let mut entry_index = 0;
    while entry_index < 8 {
        entries[entry_index] = nondet();
        entry_index += 1;
    }
    ToolAllowlist {
        entries,
        length: nondet(),
    }
}

fn nondet_state() -> MandateState {
    MandateState {
        owner: nondet_key(),
        agent: nondet_key(),
        security_authority: nondet_key(),
        period_cap: nondet(),
        period_seconds: nondet(),
        period_start: nondet(),
        spent_in_period: nondet(),
        expiry: nondet(),
        revoked: nondet(),
        nonce: nondet(),
        allowed_programs: nondet_key_allowlist(),
        allowed_payees: nondet_key_allowlist(),
        allowed_tools: nondet_tool_allowlist(),
    }
}

fn nondet_request() -> SpendRequest {
    SpendRequest {
        signer: nondet_key(),
        amount: nondet(),
        tool_id: nondet(),
        program: nondet_key(),
        payee: nondet_key(),
        expected_nonce: nondet(),
    }
}

#[rule]
pub fn revoked_mandate_never_authorizes_a_spend() {
    let mut state = nondet_state();
    state.revoked = true;
    let request = nondet_request();
    let now: i64 = nondet();
    cvlr_assert!(authorize_spend(&state, &request, now).is_err());
}
