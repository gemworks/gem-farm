use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

//goal is to keep this one as small as possible, in case someone wants to whitelist 5000 mints
#[repr(C)]
#[account]
pub struct WhitelistProof {
    pub whitelist_type: u8,
}

impl WhitelistProof {
    pub fn read_type(whitelist_type: u8) -> Result<WhitelistType, ProgramError> {
        WhitelistType::from_bits(whitelist_type).ok_or(ErrorCode::InvalidParameter.into())
    }

    pub fn reset_type(&mut self, whitelist_type: WhitelistType) {
        self.whitelist_type = whitelist_type.bits();
    }

    pub fn contains_type(&self, expected_whitelist_type: WhitelistType) -> ProgramResult {
        let whitelist_type = WhitelistProof::read_type(self.whitelist_type)?;
        if whitelist_type.contains(expected_whitelist_type) {
            return Ok(());
        }

        Err(ErrorCode::NotWhitelisted.into())
    }
}

bitflags::bitflags! {
    pub struct WhitelistType: u8 {
        const CREATOR = 1 << 0;
        const MINT = 1 << 1;
    }
}
