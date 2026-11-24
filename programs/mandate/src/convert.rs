use anchor_lang::prelude::*;

use crate::error::MandateError;
use crate::logic::constants::{MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS};
use crate::logic::error::MandateRejection;
use crate::logic::state::{KeyAllowlist, LimitUpdate, MandateState, ToolAllowlist};
use crate::state::Mandate;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LimitParams {
    pub period_cap: u64,
    pub period_seconds: i64,
    pub expiry: i64,
    pub allowed_programs: Vec<Pubkey>,
    pub allowed_payees: Vec<Pubkey>,
    pub allowed_tools: Vec<u64>,
}

pub fn rejection_to_error(rejection: MandateRejection) -> Error {
    let error: MandateError = match rejection {
        MandateRejection::Revoked => MandateError::Revoked,
        MandateRejection::Expired => MandateError::Expired,
        MandateRejection::UnauthorizedSigner => MandateError::UnauthorizedSigner,
        MandateRejection::StaleNonce => MandateError::StaleNonce,
        MandateRejection::ZeroAmount => MandateError::ZeroAmount,
        MandateRejection::ProgramNotAllowed => MandateError::ProgramNotAllowed,
        MandateRejection::PayeeNotAllowed => MandateError::PayeeNotAllowed,
        MandateRejection::ToolNotAllowed => MandateError::ToolNotAllowed,
        MandateRejection::CapExceeded => MandateError::CapExceeded,
        MandateRejection::ArithmeticOverflow => MandateError::ArithmeticOverflow,
        MandateRejection::InvalidCap => MandateError::InvalidCap,
        MandateRejection::InvalidPeriod => MandateError::InvalidPeriod,
        MandateRejection::InvalidExpiry => MandateError::InvalidExpiry,
        MandateRejection::InvalidAllowlist => MandateError::InvalidAllowlist,
        MandateRejection::CapBelowSpent => MandateError::CapBelowSpent,
        MandateRejection::AlreadyRevoked => MandateError::AlreadyRevoked,
        MandateRejection::InvalidAgent => MandateError::InvalidAgent,
    };
    error.into()
}

fn key_allowlist_from_slice<const CAPACITY: usize>(
    keys: &[Pubkey],
) -> std::result::Result<KeyAllowlist<CAPACITY>, MandateRejection> {
    if keys.is_empty() || keys.len() > CAPACITY {
        return Err(MandateRejection::InvalidAllowlist);
    }
    let mut entries = [[0u8; 32]; CAPACITY];
    for (entry_index, key) in keys.iter().enumerate() {
        entries[entry_index] = key.to_bytes();
    }
    Ok(KeyAllowlist {
        entries,
        length: keys.len() as u8,
    })
}

fn tool_allowlist_from_slice(
    tools: &[u64],
) -> std::result::Result<ToolAllowlist, MandateRejection> {
    if tools.is_empty() || tools.len() > MAX_ALLOWED_TOOLS {
        return Err(MandateRejection::InvalidAllowlist);
    }
    let mut entries = [0u64; MAX_ALLOWED_TOOLS];
    entries[..tools.len()].copy_from_slice(tools);
    Ok(ToolAllowlist {
        entries,
        length: tools.len() as u8,
    })
}

pub fn limit_update_from_params(
    params: &LimitParams,
) -> std::result::Result<LimitUpdate, MandateRejection> {
    Ok(LimitUpdate {
        period_cap: params.period_cap,
        period_seconds: params.period_seconds,
        expiry: params.expiry,
        allowed_programs: key_allowlist_from_slice::<MAX_ALLOWED_PROGRAMS>(
            &params.allowed_programs,
        )?,
        allowed_payees: key_allowlist_from_slice::<MAX_ALLOWED_PAYEES>(&params.allowed_payees)?,
        allowed_tools: tool_allowlist_from_slice(&params.allowed_tools)?,
    })
}

fn pubkeys_from_entries<const CAPACITY: usize>(
    entries: &[[u8; 32]; CAPACITY],
) -> [Pubkey; CAPACITY] {
    let mut keys = [Pubkey::default(); CAPACITY];
    for (entry_index, entry) in entries.iter().enumerate() {
        keys[entry_index] = Pubkey::new_from_array(*entry);
    }
    keys
}

fn entries_from_pubkeys<const CAPACITY: usize>(keys: &[Pubkey; CAPACITY]) -> [[u8; 32]; CAPACITY] {
    let mut entries = [[0u8; 32]; CAPACITY];
    for (entry_index, key) in keys.iter().enumerate() {
        entries[entry_index] = key.to_bytes();
    }
    entries
}

pub fn state_from_account(account: &Mandate) -> MandateState {
    MandateState {
        owner: account.owner.to_bytes(),
        agent: account.agent.to_bytes(),
        security_authority: account.security_authority.to_bytes(),
        period_cap: account.period_cap,
        period_seconds: account.period_seconds,
        period_start: account.period_start,
        spent_in_period: account.spent_in_period,
        expiry: account.expiry,
        revoked: account.revoked,
        nonce: account.nonce,
        allowed_programs: KeyAllowlist {
            entries: entries_from_pubkeys(&account.allowed_programs),
            length: account.allowed_program_count,
        },
        allowed_payees: KeyAllowlist {
            entries: entries_from_pubkeys(&account.allowed_payees),
            length: account.allowed_payee_count,
        },
        allowed_tools: ToolAllowlist {
            entries: account.allowed_tools,
            length: account.allowed_tool_count,
        },
    }
}

pub fn write_state_to_account(account: &mut Mandate, state: &MandateState) {
    account.owner = Pubkey::new_from_array(state.owner);
    account.agent = Pubkey::new_from_array(state.agent);
    account.security_authority = Pubkey::new_from_array(state.security_authority);
    account.period_cap = state.period_cap;
    account.period_seconds = state.period_seconds;
    account.period_start = state.period_start;
    account.spent_in_period = state.spent_in_period;
    account.expiry = state.expiry;
    account.revoked = state.revoked;
    account.nonce = state.nonce;
    account.allowed_programs = pubkeys_from_entries(&state.allowed_programs.entries);
    account.allowed_program_count = state.allowed_programs.length;
    account.allowed_payees = pubkeys_from_entries(&state.allowed_payees.entries);
    account.allowed_payee_count = state.allowed_payees.length;
    account.allowed_tools = state.allowed_tools.entries;
    account.allowed_tool_count = state.allowed_tools.length;
}
