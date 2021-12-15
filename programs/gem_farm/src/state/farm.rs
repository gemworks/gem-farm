use anchor_lang::prelude::*;
use gem_common::*;

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

    // --------------------------------------- farmers
    // total count, including initialized but inactive farmers
    pub farmer_count: u64,

    // active only
    pub active_farmer_count: u64,

    pub gems_staked: u64,

    // --------------------------------------- funders
    pub authorized_funder_count: u64,

    pub funded_rewards_pots: u64,

    pub active_rewards_pots: u64,

    // --------------------------------------- rewards calc
    pub rewards_duration_sec: u64,

    pub rewards_end_ts: u64,

    pub rewards_last_updated_ts: u64,

    // in tokens/s, = total reward pot at initialization / reward duration
    pub rewards_rate: u64,

    // this is cumulative, since the beginning of time
    pub accrued_rewards_per_gem: u64,
}

impl Farm {
    pub fn farm_seeds(&self) -> [&[u8]; 2] {
        [
            self.farm_authority_seed.as_ref(),
            &self.farm_authority_bump_seed,
        ]
    }

    pub fn reward_start_ts(&self) -> Result<u64, ProgramError> {
        self.rewards_end_ts.try_sub(self.rewards_duration_sec)
    }
}
