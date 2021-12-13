use anchor_lang::error;
use anchor_lang::solana_program::program_error::ProgramError::Custom;

#[error]
pub enum ErrorCode {
    // --------------------------------------- generic
    #[msg("failed to perform some math operation safely")]
    ArithmeticError,

    #[msg("unknown instruction")]
    UnknownInstruction,

    #[msg("invalid parameter")]
    InvalidParameter,

    #[msg("anchor serialization issue")]
    AccountDidNotSerialize,

    // --------------------------------------- bank-specific
    #[msg("vault is currently locked or frozen and cannot be accessed")]
    VaultAccessSuspended,

    #[msg("recorded token amount in GDR != actual amount in gem box")]
    AmountMismatch,

    #[msg("this gem is not present on any of the whitelists")]
    NotWhitelisted,

    #[msg("whitelist proof exists but for the wrong type")]
    WrongWhitelistType,
}

impl From<gem_common::GemCommonError> for ErrorCode {
    fn from(e: gem_common::GemCommonError) -> Self {
        match e {
            gem_common::GemCommonError::ArithmeticError => ErrorCode::ArithmeticError,
            gem_common::GemCommonError::AccountDidNotSerialize => ErrorCode::AccountDidNotSerialize,
        }
    }
}

// =============================================================================

use thiserror::Error;

#[derive(Error, Debug, Clone, Eq, PartialEq)]
pub enum GemCommonError {
    #[error("failed to perform some math operation safely")]
    ArithmeticError,

    #[error("anchor serialization issue")]
    AccountDidNotSerialize,
}
