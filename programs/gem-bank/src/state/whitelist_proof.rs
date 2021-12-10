use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

//goal is to keep this one as small as possible, in case someone wants to whitelist 5000 mints
#[repr(C)]
#[account]
pub struct WhitelistProof {
    whitelist_type: u8,
}

impl WhitelistProof {
    pub fn read_type(whitelist_type: u8) -> Result<WhitelistType, ProgramError> {
        WhitelistType::from_bits(whitelist_type).ok_or(ErrorCode::InvalidParameter.into())
    }

    pub fn reset_type(&mut self, whitelist_type: WhitelistType) {
        self.whitelist_type = whitelist_type.bits();
    }
}

bitflags::bitflags! {
    pub struct WhitelistType: u8 {
        const CREATOR = 1 << 0;
        const UPDATE_AUTHORITY = 1 << 1;
        const MINT = 1 << 2;
    }
}
