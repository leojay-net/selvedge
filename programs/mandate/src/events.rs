use anchor_lang::prelude::*;

#[event]
pub struct MandateCreated {
    pub mandate: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub period_cap: u64,
    pub expiry: i64,
}

#[event]
pub struct LimitsUpdated {
    pub mandate: Pubkey,
    pub period_cap: u64,
    pub period_seconds: i64,
    pub expiry: i64,
}

#[event]
pub struct MandateRevoked {
    pub mandate: Pubkey,
    pub revoked_by: Pubkey,
}

#[event]
pub struct SpendAuthorized {
    pub mandate: Pubkey,
    pub payee: Pubkey,
    pub tool_id: u64,
    pub amount: u64,
    pub spent_in_period: u64,
    pub nonce: u64,
}

#[event]
pub struct AgentRotated {
    pub mandate: Pubkey,
    pub previous_agent: Pubkey,
    pub new_agent: Pubkey,
}

#[event]
pub struct MandateClosed {
    pub mandate: Pubkey,
}
