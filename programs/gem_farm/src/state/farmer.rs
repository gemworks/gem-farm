use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct Farmer {
    pub farm: Pubkey,

    pub owner: Pubkey,

    /// The amount of token A claimed.
    pub reward_per_token_complete: u128,
    /// The amount of token A pending claim.
    pub reward_per_token_pending: u64,

    /// The amount staked.
    pub balance_staked: u64,
}
