use anchor_lang::prelude::*;

pub const LATEST_FARM_VERSION: u16 = 0;

#[repr(C)]
#[account]
pub struct Farm {
    pub farm_manager: Pubkey,

    pub version: u16,

    // bank storing farmers' gems, single vault per farmer
    pub bank: Pubkey,

    // signs off on any bank operations related to the farm
    // pub authority: Pubkey,
    // pub authority_seed: Pubkey,
    // pub authority_bump_seed: [u8; 1],
    /// Mint of the reward A token.
    pub reward_mint: Pubkey,
    /// Vault to store reward A tokens.
    pub reward_vault: Pubkey,
    /// Rate of reward A distribution.
    pub reward_rate: u64,
    /// Last calculated reward A per pool token.
    pub reward_per_token_stored: u128,

    pub reward_duration: u64,

    pub reward_duration_end: u64,

    pub last_update_time: u64,

    pub farmer_count: u64,

    pub funder_count: u64,
}
