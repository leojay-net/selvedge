use super::constants::{MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS};

pub type KeyBytes = [u8; 32];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyAllowlist<const CAPACITY: usize> {
    pub entries: [KeyBytes; CAPACITY],
    pub length: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ToolAllowlist {
    pub entries: [u64; MAX_ALLOWED_TOOLS],
    pub length: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MandateState {
    pub owner: KeyBytes,
    pub agent: KeyBytes,
    pub security_authority: KeyBytes,
    pub period_cap: u64,
    pub period_seconds: i64,
    pub period_start: i64,
    pub spent_in_period: u64,
    pub expiry: i64,
    pub revoked: bool,
    pub nonce: u64,
    pub allowed_programs: KeyAllowlist<MAX_ALLOWED_PROGRAMS>,
    pub allowed_payees: KeyAllowlist<MAX_ALLOWED_PAYEES>,
    pub allowed_tools: ToolAllowlist,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpendRequest {
    pub signer: KeyBytes,
    pub amount: u64,
    pub tool_id: u64,
    pub program: KeyBytes,
    pub payee: KeyBytes,
    pub expected_nonce: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LimitUpdate {
    pub period_cap: u64,
    pub period_seconds: i64,
    pub expiry: i64,
    pub allowed_programs: KeyAllowlist<MAX_ALLOWED_PROGRAMS>,
    pub allowed_payees: KeyAllowlist<MAX_ALLOWED_PAYEES>,
    pub allowed_tools: ToolAllowlist,
}

impl<const CAPACITY: usize> KeyAllowlist<CAPACITY> {
    pub fn contains(&self, candidate: &KeyBytes) -> bool {
        let mut entry_index = 0;
        while entry_index < self.length as usize && entry_index < CAPACITY {
            if self.entries[entry_index] == *candidate {
                return true;
            }
            entry_index += 1;
        }
        false
    }

    pub fn is_valid(&self) -> bool {
        self.length >= 1 && (self.length as usize) <= CAPACITY
    }
}

impl ToolAllowlist {
    pub fn contains(&self, candidate: u64) -> bool {
        let mut entry_index = 0;
        while entry_index < self.length as usize && entry_index < MAX_ALLOWED_TOOLS {
            if self.entries[entry_index] == candidate {
                return true;
            }
            entry_index += 1;
        }
        false
    }

    pub fn is_valid(&self) -> bool {
        self.length >= 1 && (self.length as usize) <= MAX_ALLOWED_TOOLS
    }
}
