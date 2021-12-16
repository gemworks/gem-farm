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
    // --------------------------------------- generic (0 - 19)
    #[msg("failed to perform some math operation safely")]
    ArithmeticError,

    #[msg("unknown instruction called")]
    UnknownInstruction,

    #[msg("invalid parameter passed")]
    InvalidParameter,

    #[msg("anchor serialization issue")]
    AnchorSerializationIssue,

    #[msg("two amounts that are supposed to be equal are not")]
    AmountMismatch,

    Reserved5,
    Reserved6,
    Reserved7,
    Reserved8,
    Reserved9,
    Reserved10,
    Reserved11,
    Reserved12,
    Reserved13,
    Reserved14,
    Reserved15,
    Reserved16,
    Reserved17,
    Reserved18,
    Reserved19,

    // --------------------------------------- bank specific (20 - 39)
    #[msg("vault is currently locked or frozen and cannot be accessed")]
    VaultAccessSuspended,

    #[msg("vault doesnt't containt any gems")]
    VaultIsEmpty,

    #[msg("this gem is not present on any of the whitelists")]
    NotWhitelisted,

    #[msg("whitelist proof exists but for the wrong type")]
    WrongWhitelistType,

    Reserved24,
    Reserved25,
    Reserved26,
    Reserved27,
    Reserved28,
    Reserved29,
    Reserved30,
    Reserved31,
    Reserved32,
    Reserved33,
    Reserved34,
    Reserved35,
    Reserved36,
    Reserved37,
    Reserved38,
    Reserved39,

    // --------------------------------------- farm specific (40 - 59)
    #[msg("passed in reward mint is not available for this farm")]
    UnknownRewardMint,

    Reserved41,
    Reserved42,
    Reserved43,
    Reserved44,
    Reserved45,
    Reserved46,
    Reserved47,
    Reserved48,
    Reserved49,
    Reserved50,
    Reserved51,
    Reserved52,
    Reserved53,
    Reserved54,
    Reserved55,
    Reserved56,
    Reserved57,
    Reserved58,
    Reserved59,
}
