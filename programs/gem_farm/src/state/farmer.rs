use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct Farmer {
    pub farm: Pubkey,

    // the identity of the farmer = their public key
    pub identity: Pubkey,

    // vault storing all of the farmer's gems
    pub vault: Pubkey,

    /// The amount of token A claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token A pending claim.
    pub reward_per_token_pending: u64,

    // total number of gems at the time when the vault is locked
    pub gems_staked: u64,
}
