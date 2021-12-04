use anchor_lang::prelude::*;
use jet_proc_macros::assert_size;

#[assert_size(40)]
#[repr(C)]
#[account]
pub struct Vault {
    // Nth vault gets N id. This means 1st vault has N=1, not N=0
    pub vault_id: u64,

    // each vault is registered with a single bank, used for indexing
    pub bank: Pubkey,
}
