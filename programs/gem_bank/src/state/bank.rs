use anchor_lang::prelude::*;
use gem_common::errors::ErrorCode;

pub const LATEST_BANK_VERSION: u16 = 0;

#[repr(C)]
#[account]
pub struct Bank {
    pub version: u16,

    pub bank_manager: Pubkey,

    pub flags: u32,

    // todo verify these are incremented / decremented correctly
    // only gems allowed will be those that have EITHER a:
    // 1)creator from this list
    pub whitelisted_creators: u32,
    // OR
    // 2)mint from this list
    pub whitelisted_mints: u32,

    pub vault_count: u64,
}

impl Bank {
    pub fn read_flags(flags: u32) -> Result<BankFlags, ProgramError> {
        BankFlags::from_bits(flags).ok_or(ErrorCode::InvalidParameter.into())
    }

    pub fn reset_flags(&mut self, flags: BankFlags) {
        self.flags = flags.bits();
    }
}

bitflags::bitflags! {
    pub struct BankFlags: u32 {
        const FREEZE_VAULTS = 1 << 0;
    }
}
