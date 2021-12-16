use crate::state::{Farmer, FarmerRewardTracker};
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

    pub fn fund_reward_by_mint(
        &mut self,
        now_ts: u64,
        new_amount: u64,
        new_duration_sec: u64,
        reward_mint: Pubkey,
    ) -> ProgramResult {
        let farm_reward = self.match_reward_by_mint(reward_mint)?;

        farm_reward.fund_reward(now_ts, new_amount, new_duration_sec)?;

        self.rewards_last_updated_ts = now_ts;

        Ok(())
    }

    pub fn defund_reward_by_mint(
        &mut self,
        now_ts: u64,
        funder_withdrawable_amount: u64,
        desired_amount: u64,
        reward_mint: Pubkey,
    ) -> Result<u64, ProgramError> {
        let farm_reward = self.match_reward_by_mint(reward_mint)?;

        let to_defund =
            farm_reward.defund_reward(now_ts, desired_amount, funder_withdrawable_amount)?;

        self.rewards_last_updated_ts = now_ts;

        Ok(to_defund)
    }

    pub fn update_rewards_for_all_mints(
        &mut self,
        now_ts: u64,
        mut farmer: Option<&mut Account<Farmer>>,
    ) -> ProgramResult {
        // reward a
        let (farmer_gems_staked, farmer_reward_a) = match farmer {
            Some(ref mut farmer) => (Some(farmer.gems_staked), Some(&mut farmer.reward_a)),
            None => (None, None),
        };

        self.reward_a.update_accrued_reward(
            now_ts,
            self.rewards_last_updated_ts,
            self.gems_staked,
            farmer_gems_staked,
            farmer_reward_a,
        )?;

        // reward b
        let farmer_reward_b = match farmer {
            Some(ref mut farmer) => Some(&mut farmer.reward_b),
            None => None,
        };

        self.reward_b.update_accrued_reward(
            now_ts,
            self.rewards_last_updated_ts,
            self.gems_staked,
            farmer_gems_staked,
            farmer_reward_b,
        )?;

        self.rewards_last_updated_ts = now_ts;

        Ok(())
    }
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

    // --------------------------------------- configured whenever rewards update is run
    // this is cumulative, since the beginning of time
    pub accrued_reward_per_gem: u64,

    // --------------------------------------- configured separately
    pub locked: bool,
}

impl FarmRewardTracker {
    pub fn reward_start_ts(&self) -> Result<u64, ProgramError> {
        self.reward_end_ts.try_sub(self.reward_duration_sec)
    }

    pub fn unaccrued_funding(&self, now_ts: u64) -> Result<u64, ProgramError> {
        self.reward_end_ts
            .try_sub(now_ts)?
            .try_mul(self.reward_rate)
    }

    pub fn lock_reward(&mut self) -> ProgramResult {
        self.locked = true;
        Ok(())
    }

    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        new_amount: u64,
        new_duration_sec: u64,
    ) -> ProgramResult {
        // if previous rewards have been exhausted
        if now_ts > self.reward_end_ts {
            self.reward_rate = new_amount.try_floor_div(new_duration_sec)?;
        // else if previous rewards are still active (merge the two)
        } else {
            let remaining_duration_sec = self.reward_end_ts.try_sub(now_ts)?;
            let remaining_amount = remaining_duration_sec.try_mul(self.reward_rate)?;

            self.reward_rate = new_amount
                .try_add(remaining_amount)?
                .try_floor_div(new_duration_sec)?;
        }

        self.reward_duration_sec = new_duration_sec;
        self.reward_end_ts = now_ts.try_add(new_duration_sec)?;

        Ok(())
    }

    pub fn defund_reward(
        &mut self,
        now_ts: u64,
        desired_amount: u64,
        funder_withdrawable_amount: u64,
    ) -> Result<u64, ProgramError> {
        let unaccrued_funding = self.unaccrued_funding(now_ts)?;

        // calc how much is actually available for defunding
        let mut to_defund = std::cmp::min(unaccrued_funding, desired_amount);
        to_defund = std::cmp::min(to_defund, funder_withdrawable_amount);

        // update reward rate
        let remaining_funding = unaccrued_funding.try_sub(to_defund)?;
        self.reward_rate = remaining_funding.try_floor_div(self.reward_duration_sec)?;

        Ok(to_defund)
    }

    fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        rewards_last_updated_ts: u64,
        farm_gems_staked: u64,
        farmer_gems_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerRewardTracker>,
    ) -> ProgramResult {
        let reward_upper_bound_ts = self.calc_reward_upper_bound(now_ts);

        let newly_accrued_reward_per_gem = self.calc_newly_accrued_reward(
            farm_gems_staked,
            reward_upper_bound_ts,
            rewards_last_updated_ts,
        )?;

        // update farm
        self.accrued_reward_per_gem
            .try_self_add(newly_accrued_reward_per_gem)?;

        // update farmer too, if one has been passed
        if let Some(farmer_reward) = farmer_reward {
            let newly_accrued_reward_per_farmer =
                newly_accrued_reward_per_gem.try_mul(farmer_gems_staked.unwrap())?;

            farmer_reward
                .accrued_reward
                .try_self_add(newly_accrued_reward_per_farmer)?;
        }

        Ok(())
    }

    pub fn calc_newly_accrued_reward(
        &self,
        farm_gems_staked: u64,
        reward_upper_bound_ts: u64,
        rewards_last_updated_ts: u64,
    ) -> Result<u64, ProgramError> {
        // if no gems staked, return existing accrued reward
        if farm_gems_staked == 0 {
            return Ok(self.accrued_reward_per_gem);
        }

        // if no time has passed, return existing accrued reward
        if reward_upper_bound_ts <= rewards_last_updated_ts {
            return Ok(self.accrued_reward_per_gem);
        }

        let time_since_last_calc_sec = reward_upper_bound_ts.try_sub(rewards_last_updated_ts)?;

        time_since_last_calc_sec
            .try_mul(self.reward_rate)?
            .try_floor_div(farm_gems_staked)
    }

    fn calc_reward_upper_bound(&self, now_ts: u64) -> u64 {
        std::cmp::min(self.reward_end_ts, now_ts)
    }
}

// todo factor in precision later
const PRECISION: u128 = u64::MAX as u128;
