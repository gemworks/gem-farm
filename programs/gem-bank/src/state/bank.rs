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

bitflags::bitflags! {
    pub struct BankFlags: u64 {
        const FREEZE_UNLOCKED_VAULTS = 1 << 0;
        const FREEZE_LOCKED_VAULTS = 1 << 1;
        const FREEZE_AUCTIONED_VAULTS = 1 << 2;
        const FREEZE_BOUGHT_OUT_VAULTS = 1 << 3;
        const FREEZE_ALL_VAULTS = Self::FREEZE_UNLOCKED_VAULTS.bits
                                | Self::FREEZE_LOCKED_VAULTS.bits
                                | Self::FREEZE_AUCTIONED_VAULTS.bits
                                | Self::FREEZE_BOUGHT_OUT_VAULTS.bits;
    }
}
