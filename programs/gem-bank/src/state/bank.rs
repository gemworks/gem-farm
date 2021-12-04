use anchor_lang::prelude::*;

use jet_proc_macros::assert_size;

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
    pub fn reset_flags(&mut self, flags: BankFlags) {
        self.flags = flags.bits();
    }
}

// todo make sure these are actually active
bitflags::bitflags! {
    pub struct BankFlags: u64 {
        const FREEZE_UNLOCKED_VAULTS = 1 << 0;
        const FREEZE_LOCKED_VAULTS = 1 << 1;
        const FREEZE_ALL_VAULTS = Self::FREEZE_UNLOCKED_VAULTS.bits
                                | Self::FREEZE_LOCKED_VAULTS.bits;
    }
}
