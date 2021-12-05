use anchor_lang::prelude::*;
use jet_proc_macros::assert_size;

#[assert_size(152)]
#[repr(C)]
#[account]
pub struct Vault {
    // Nth vault gets N id. This means 1st vault has N=1, not N=0
    pub vault_id: u64,

    // each vault is registered with a single bank, used for indexing
    pub bank: Pubkey,

    // has the sole right to update Vault state, incl. changing authority
    pub owner: Pubkey,

    // has the sole right to move gems in/out of the vault
    pub authority: Pubkey,

    // are used to derive / sign on behalf of the vault authority PDA
    pub authority_seed: Pubkey,
    pub authority_bump_seed: [u8; 1],

    pub _reserved: [u8; 7],

    // total number of NFTs stored in the vault
    pub gem_box_count: u64,
}

impl Vault {
    pub fn vault_seeds(&self) -> [&[u8]; 2] {
        [self.authority_seed.as_ref(), &self.authority_bump_seed]
    }
}
