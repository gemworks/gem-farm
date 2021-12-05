use anchor_lang::error;

#[error]
pub enum ErrorCode {
    #[msg("failed to perform some math operation safely")]
    ArithmeticError,

    #[msg("unknown instruction")]
    UnknownInstruction,

    #[msg("invalid parameter")]
    InvalidParameter,

    #[msg("vault is currently locked or frozen and cannot be accessed")]
    VaultAccessSuspended,
}

impl From<jet_math::Error> for ErrorCode {
    fn from(_: jet_math::Error) -> ErrorCode {
        ErrorCode::ArithmeticError
    }
}
