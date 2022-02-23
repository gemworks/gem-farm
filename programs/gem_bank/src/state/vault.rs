use anchor_lang::prelude::*;

use crate::state::{Bank, BankFlags};

#[proc_macros::assert_size(288)] // + 6 to make it /8
#[repr(C)]
#[account]
pub struct Vault {
    /// each vault is registered with a single bank, used for indexing
    pub bank: Pubkey,

    /// responsible for signing deposits / withdrawals into the vault
    /// (!) NOTE: does NOT un/lock the vault - the bank manager does that
    /// can update itself to another Pubkey
    pub owner: Pubkey,

    /// pubkey used to create the vault, baked into vault's PDA - NOT CHANGEABLE
    pub creator: Pubkey,

    /// signs off on any token transfers out of the gem boxes controlled by the vault
    pub authority: Pubkey,

    pub authority_seed: Pubkey,

    pub authority_bump_seed: [u8; 1],

    /// when the vault is locked, no gems can move in/out of it
    pub locked: bool,

    pub name: [u8; 32],

    /// total number of token mints stored in the vault (gem box per mint)
    pub gem_box_count: u64,

    /// gem_boxes can store >1 token, see detailed explanation on GDR
    pub gem_count: u64,

    /// each gem has a rarity of 1 if not specified
    /// thus worst case, when rarities aren't enabled, this is == gem_count
    pub rarity_points: u64,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 64],
}

impl Vault {
    pub fn vault_seeds(&self) -> [&[u8]; 2] {
        [self.authority_seed.as_ref(), &self.authority_bump_seed]
    }

    pub fn access_suspended(&self, flags: u32) -> Result<bool> {
        let bank_flags = Bank::read_flags(flags)?;

        if self.locked {
            return Ok(true);
        }

        if bank_flags.contains(BankFlags::FREEZE_VAULTS) {
            return Ok(true);
        }

        Ok(false)
    }
}
