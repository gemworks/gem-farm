use anchor_lang::prelude::*;

pub const LATEST_FARM_VERSION: u16 = 0;

#[repr(C)]
#[account]
pub struct Farm {
    pub version: u16,

    pub farm_manager: Pubkey,

    // signs off on any bank operations related to the farm
    pub farm_authority: Pubkey,

    pub farm_authority_seed: Pubkey,

    pub farm_authority_bump_seed: [u8; 1],

    // each farm controls a single bank
    pub bank: Pubkey,

    // --------------------------------------- farmers

    // total count, including initialized but inactive farmers
    pub farmer_count: u64,

    // active only
    pub active_farmer_count: u64,

    // --------------------------------------- funders
    pub authorized_funder_count: u64,

    pub funded_rewards_pots: u64,

    pub active_rewards_pots: u64,

    // --------------------------------------- rewards calc
    pub last_update_time: u64,

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
}

impl Farm {
    pub fn farm_seeds(&self) -> [&[u8]; 2] {
        [
            self.farm_authority_seed.as_ref(),
            &self.farm_authority_bump_seed,
        ]
    }
}
