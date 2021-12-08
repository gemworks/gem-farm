use crate::state::{Bank, BankFlags};
use anchor_lang::prelude::*;
use jet_proc_macros::assert_size;

#[assert_size(176)]
#[repr(C)]
#[account]
pub struct Vault {
    // each vault is registered with a single bank, used for indexing
    pub bank: Pubkey,

    // has the sole right to update Vault state, incl. changing authority
    pub owner: Pubkey,

    // created the vault, this PK is baked into the derived PDA
    pub creator: Pubkey,

    // has the sole right to move gems in/out of the vault
    pub authority: Pubkey,

    pub authority_seed: Pubkey,

    pub authority_bump_seed: [u8; 1],

    pub locked: bool,

    pub _reserved: [u8; 6],

    // total number of NFTs stored in the vault
    pub gem_box_count: u64,
}

impl Vault {
    pub fn vault_seeds(&self) -> [&[u8]; 2] {
        [self.authority_seed.as_ref(), &self.authority_bump_seed]
    }

    pub fn access_suspended(&self, flags: u64) -> Result<bool, ProgramError> {
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
