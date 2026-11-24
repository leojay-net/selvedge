use anchor_lang::prelude::*;

use crate::logic::constants::{MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS};

#[account]
#[derive(InitSpace)]
pub struct Mandate {
    pub version: u8,
    pub bump: u8,
    pub mandate_id: u64,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub security_authority: Pubkey,
    pub mint: Pubkey,
    pub period_cap: u64,
    pub period_seconds: i64,
    pub period_start: i64,
    pub spent_in_period: u64,
    pub expiry: i64,
    pub revoked: bool,
    pub nonce: u64,
    pub allowed_programs: [Pubkey; MAX_ALLOWED_PROGRAMS],
    pub allowed_program_count: u8,
    pub allowed_payees: [Pubkey; MAX_ALLOWED_PAYEES],
    pub allowed_payee_count: u8,
    pub allowed_tools: [u64; MAX_ALLOWED_TOOLS],
    pub allowed_tool_count: u8,
}
