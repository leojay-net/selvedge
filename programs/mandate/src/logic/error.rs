#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum MandateRejection {
    Revoked = 0,
    Expired = 1,
    UnauthorizedSigner = 2,
    StaleNonce = 3,
    ZeroAmount = 4,
    ProgramNotAllowed = 5,
    PayeeNotAllowed = 6,
    ToolNotAllowed = 7,
    CapExceeded = 8,
    ArithmeticOverflow = 9,
    InvalidCap = 10,
    InvalidPeriod = 11,
    InvalidExpiry = 12,
    InvalidAllowlist = 13,
    CapBelowSpent = 14,
    AlreadyRevoked = 15,
    InvalidAgent = 16,
}
