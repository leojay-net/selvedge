use anchor_lang::prelude::*;

#[error_code]
pub enum MandateError {
    #[msg("The mandate has been revoked")]
    Revoked,
    #[msg("The mandate has expired")]
    Expired,
    #[msg("The signer is not authorised for this operation")]
    UnauthorizedSigner,
    #[msg("The nonce does not match the mandate nonce")]
    StaleNonce,
    #[msg("The amount must be greater than zero")]
    ZeroAmount,
    #[msg("The target program is not on the mandate allowlist")]
    ProgramNotAllowed,
    #[msg("The payee is not on the mandate allowlist")]
    PayeeNotAllowed,
    #[msg("The tool is not on the mandate allowlist")]
    ToolNotAllowed,
    #[msg("The spend would exceed the period cap")]
    CapExceeded,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("The period cap must be greater than zero")]
    InvalidCap,
    #[msg("The period length is out of range")]
    InvalidPeriod,
    #[msg("The expiry must be in the future")]
    InvalidExpiry,
    #[msg("An allowlist is empty or exceeds its capacity")]
    InvalidAllowlist,
    #[msg("The new cap is below the amount already spent in the period")]
    CapBelowSpent,
    #[msg("The mandate is already revoked")]
    AlreadyRevoked,
    #[msg("The agent key is not valid")]
    InvalidAgent,
    #[msg("The token account does not belong to the mandate owner")]
    TokenAccountOwnerMismatch,
}
