use anchor_lang::prelude::*;

/// Do NOT reorder the errors in this enum. Tests are relying on error ordering.
/// Not great, but for some reason when ErrorCode is factored out into a lib,
/// test messages no longer print actual messages and print error codes instead.
///
/// The other alternative is to have a custom error type inside the common library
/// and to try to convert that -> ErrorCode -> ProgramError
/// Unfortunately I wasn't able to get that working, last leg is failing.
///
/// todo to revisit in v1
#[error]
pub enum ErrorCode {
    //0
    #[msg("failed to perform some math operation safely")]
    ArithmeticError,

    #[msg("unknown instruction")]
    UnknownInstruction,

    #[msg("invalid parameter")]
    InvalidParameter,

    #[msg("vault is currently locked or frozen and cannot be accessed")]
    VaultAccessSuspended,

    #[msg("recorded token amount in GDR != actual amount in gem box")]
    AmountMismatch,

    //5
    #[msg("anchor serialization issue")]
    AccountDidNotSerialize,

    #[msg("this gem is not present on any of the whitelists")]
    NotWhitelisted,

    #[msg("whitelist proof exists but for the wrong type")]
    WrongWhitelistType,
}
