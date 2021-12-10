use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

pub const LATEST_BANK_VERSION: u16 = 0;

#[repr(C)]
#[account]
pub struct Bank {
    pub manager: Pubkey, //todo need tests for findXPDA functions, in case I move fields around

    pub version: u16,

    pub flags: u8,

    // only gems allowed will be those that have EITHER a:
    // 1)creator from this list
    pub whitelisted_creators: u32,
    // OR
    // 2)update authority from this list
    pub whitelisted_update_authorities: u32,
    // OR
    // 3)mint from this list
    pub whitelisted_mints: u32,

    pub vault_count: u64,
}

impl Bank {
    pub fn read_flags(flags: u8) -> Result<BankFlags, ProgramError> {
        BankFlags::from_bits(flags).ok_or(ErrorCode::InvalidParameter.into())
    }

    pub fn reset_flags(&mut self, flags: BankFlags) {
        self.flags = flags.bits();
    }
}

bitflags::bitflags! {
    pub struct BankFlags: u8 {
        const FREEZE_VAULTS = 1 << 0;
    }
}
