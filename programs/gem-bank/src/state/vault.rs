use anchor_lang::prelude::*;
use jet_proc_macros::assert_size;

#[assert_size(40)]
#[repr(C)]
#[account(zero_copy)]
pub struct Vault {
    // Nth vault gets N id. This means 1st vault has N=1, not N=0
    pub vault_id: u64,

    // vaults are linked to a particular keepr, and can't be unlinked
    pub keepr: Pubkey,
}
