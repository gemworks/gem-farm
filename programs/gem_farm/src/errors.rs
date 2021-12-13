use anchor_lang::prelude::*;

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
    // --------------------------------------- farm-specific
}
