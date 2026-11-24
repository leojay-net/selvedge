use super::constants::{MAX_PERIOD_SECONDS, MIN_PERIOD_SECONDS};
use super::error::MandateRejection;
use super::state::{KeyBytes, LimitUpdate, MandateState, SpendRequest};

pub fn validate_limits(update: &LimitUpdate, now: i64) -> Result<(), MandateRejection> {
    if update.period_cap == 0 {
        return Err(MandateRejection::InvalidCap);
    }
    if update.period_seconds < MIN_PERIOD_SECONDS || update.period_seconds > MAX_PERIOD_SECONDS {
        return Err(MandateRejection::InvalidPeriod);
    }
    if update.expiry <= now {
        return Err(MandateRejection::InvalidExpiry);
    }
    if !update.allowed_programs.is_valid()
        || !update.allowed_payees.is_valid()
        || !update.allowed_tools.is_valid()
    {
        return Err(MandateRejection::InvalidAllowlist);
    }
    Ok(())
}

pub fn is_expired(state: &MandateState, now: i64) -> bool {
    now >= state.expiry
}

/// Moves the accounting window forward when the current period has ended, so
/// a stale window can never be used to bypass or to over-count the cap.
pub fn roll_period(state: &MandateState, now: i64) -> Result<MandateState, MandateRejection> {
    let period_end = state
        .period_start
        .checked_add(state.period_seconds)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    if now < period_end {
        return Ok(*state);
    }
    let elapsed = now
        .checked_sub(state.period_start)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    if state.period_seconds <= 0 {
        return Err(MandateRejection::InvalidPeriod);
    }
    let whole_periods = elapsed / state.period_seconds;
    let advance = whole_periods
        .checked_mul(state.period_seconds)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    let next_start = state
        .period_start
        .checked_add(advance)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    let mut rolled = *state;
    rolled.period_start = next_start;
    rolled.spent_in_period = 0;
    Ok(rolled)
}

pub fn authorize_spend(
    state: &MandateState,
    request: &SpendRequest,
    now: i64,
) -> Result<MandateState, MandateRejection> {
    if state.revoked {
        return Err(MandateRejection::Revoked);
    }
    if request.signer != state.agent {
        return Err(MandateRejection::UnauthorizedSigner);
    }
    if is_expired(state, now) {
        return Err(MandateRejection::Expired);
    }
    if request.expected_nonce != state.nonce {
        return Err(MandateRejection::StaleNonce);
    }
    if request.amount == 0 {
        return Err(MandateRejection::ZeroAmount);
    }
    if !state.allowed_programs.contains(&request.program) {
        return Err(MandateRejection::ProgramNotAllowed);
    }
    if !state.allowed_payees.contains(&request.payee) {
        return Err(MandateRejection::PayeeNotAllowed);
    }
    if !state.allowed_tools.contains(request.tool_id) {
        return Err(MandateRejection::ToolNotAllowed);
    }
    let mut next = roll_period(state, now)?;
    let spent_after = next
        .spent_in_period
        .checked_add(request.amount)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    if spent_after > next.period_cap {
        return Err(MandateRejection::CapExceeded);
    }
    next.spent_in_period = spent_after;
    next.nonce = next
        .nonce
        .checked_add(1)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    Ok(next)
}

pub fn authorize_revoke(
    state: &MandateState,
    signer: &KeyBytes,
) -> Result<MandateState, MandateRejection> {
    if *signer != state.owner && *signer != state.security_authority {
        return Err(MandateRejection::UnauthorizedSigner);
    }
    if state.revoked {
        return Err(MandateRejection::AlreadyRevoked);
    }
    let mut next = *state;
    next.revoked = true;
    Ok(next)
}

pub fn authorize_limit_update(
    state: &MandateState,
    signer: &KeyBytes,
    update: &LimitUpdate,
    now: i64,
) -> Result<MandateState, MandateRejection> {
    if *signer != state.owner {
        return Err(MandateRejection::UnauthorizedSigner);
    }
    if state.revoked {
        return Err(MandateRejection::Revoked);
    }
    validate_limits(update, now)?;
    let mut next = roll_period(state, now)?;
    if update.period_cap < next.spent_in_period {
        return Err(MandateRejection::CapBelowSpent);
    }
    next.period_cap = update.period_cap;
    next.period_seconds = update.period_seconds;
    next.expiry = update.expiry;
    next.allowed_programs = update.allowed_programs;
    next.allowed_payees = update.allowed_payees;
    next.allowed_tools = update.allowed_tools;
    Ok(next)
}

pub fn authorize_agent_rotation(
    state: &MandateState,
    signer: &KeyBytes,
    new_agent: &KeyBytes,
) -> Result<MandateState, MandateRejection> {
    if *signer != state.owner {
        return Err(MandateRejection::UnauthorizedSigner);
    }
    if state.revoked {
        return Err(MandateRejection::Revoked);
    }
    if *new_agent == state.owner || *new_agent == [0u8; 32] {
        return Err(MandateRejection::InvalidAgent);
    }
    let mut next = *state;
    next.agent = *new_agent;
    next.nonce = next
        .nonce
        .checked_add(1)
        .ok_or(MandateRejection::ArithmeticOverflow)?;
    Ok(next)
}

pub fn build_initial_state(
    owner: &KeyBytes,
    agent: &KeyBytes,
    security_authority: &KeyBytes,
    update: &LimitUpdate,
    now: i64,
) -> Result<MandateState, MandateRejection> {
    if *agent == *owner || *agent == [0u8; 32] {
        return Err(MandateRejection::InvalidAgent);
    }
    validate_limits(update, now)?;
    Ok(MandateState {
        owner: *owner,
        agent: *agent,
        security_authority: *security_authority,
        period_cap: update.period_cap,
        period_seconds: update.period_seconds,
        period_start: now,
        spent_in_period: 0,
        expiry: update.expiry,
        revoked: false,
        nonce: 0,
        allowed_programs: update.allowed_programs,
        allowed_payees: update.allowed_payees,
        allowed_tools: update.allowed_tools,
    })
}
