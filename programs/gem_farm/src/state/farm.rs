use anchor_lang::prelude::*;
use gem_common::errors::ErrorCode;
use gem_common::*;
use std::ops::Index;

pub const LATEST_FARM_VERSION: u16 = 0;

#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farm {
    pub version: u16,

    pub farm_manager: Pubkey,

    // signs off on any bank operations related to the farm
    pub farm_authority: Pubkey,

    pub farm_authority_seed: Pubkey,

    pub farm_authority_bump_seed: [u8; 1],

    // each farm controls a single bank
    pub bank: Pubkey,

    // todo make sure all of the below count vars are incr'ed/decr'ed correctly
    // --------------------------------------- farmers
    // total count, including initialized but inactive farmers
    pub farmer_count: u64,

    // active only
    pub active_farmer_count: u64,

    pub gems_staked: u64,

    // --------------------------------------- funders
    pub authorized_funder_count: u64,

    // --------------------------------------- rewards
    pub rewards_last_updated_ts: u64,

    pub reward_a: FarmRewardTracker,

    pub reward_b: FarmRewardTracker,
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmRewardTracker {
    // --------------------------------------- configured on farm init
    pub reward_mint: Pubkey,

    pub reward_pot: Pubkey,

    // --------------------------------------- configured on funding
    pub reward_duration_sec: u64,

    pub reward_end_ts: u64,

    // in tokens/s, = total reward pot at initialization / reward duration
    pub reward_rate: u64,

    pub total_deposited_amount: u64,

    pub total_deposit_count: u64,

    // --------------------------------------- configured whenever rewards update is run
    // this is cumulative, since the beginning of time
    pub accrued_reward_per_gem: u64,
}

impl Farm {
    pub fn farm_seeds(&self) -> [&[u8]; 2] {
        [
            self.farm_authority_seed.as_ref(),
            &self.farm_authority_bump_seed,
        ]
    }

    pub fn match_reward_by_mint(
        &mut self,
        reward_mint: Pubkey,
    ) -> Result<&mut FarmRewardTracker, ProgramError> {
        let reward_a_mint = self.reward_a.reward_mint;
        let reward_b_mint = self.reward_b.reward_mint;

        match reward_mint {
            _ if reward_mint == reward_a_mint => Ok(&mut self.reward_a),
            _ if reward_mint == reward_b_mint => Ok(&mut self.reward_b),
            _ => Err(ErrorCode::UnknownRewardMint.into()),
        }
    }
}

impl FarmRewardTracker {
    pub fn reward_start_ts(&self) -> Result<u64, ProgramError> {
        self.reward_end_ts.try_sub(self.reward_duration_sec)
    }
}
