use anchor_lang::prelude::*;

use crate::state::{Bank, BankFlags};

#[repr(C)]
#[account]
pub struct Vault {
    // each vault is registered with a single bank, used for indexing
    pub bank: Pubkey,

    // has the sole right to update Vault state, incl. assigning someone else as owner
    pub owner: Pubkey,

    // baked into vault's PDA - NOT CHANGEABLE
    pub creator: Pubkey,

    // signs off on any token transfers out of the gem boxes controlled by the vault
    pub authority: Pubkey,

    pub authority_seed: Pubkey,

    pub authority_bump_seed: [u8; 1],

    pub locked: bool,

    pub name: [u8; 32],

    // total number of NFTs stored in the vault
    pub gem_box_count: u64,
}

impl Vault {
    pub fn vault_seeds(&self) -> [&[u8]; 2] {
        [self.authority_seed.as_ref(), &self.authority_bump_seed]
    }

    pub fn access_suspended(&self, flags: u8) -> Result<bool, ProgramError> {
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
