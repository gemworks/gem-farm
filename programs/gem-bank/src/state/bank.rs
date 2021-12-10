use anchor_lang::prelude::*;
use jet_proc_macros::assert_size;

use crate::errors::ErrorCode;

pub const LATEST_BANK_VERSION: u64 = 0;

#[assert_size(56)]
#[repr(C)]
#[account]
pub struct Bank {
    pub version: u64,

    pub flags: u64,

    pub manager: Pubkey,

    pub vault_count: u64,
}

impl Bank {
    pub fn read_flags(flags: u64) -> Result<BankFlags, ProgramError> {
        BankFlags::from_bits(flags).ok_or(ErrorCode::InvalidParameter.into())
    }

    pub fn reset_flags(&mut self, flags: BankFlags) {
        self.flags = flags.bits();
    }
}

bitflags::bitflags! {
    pub struct BankFlags: u64 {
        const FREEZE_VAULTS = 1 << 0;
    }
}
