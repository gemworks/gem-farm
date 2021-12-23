use anchor_lang::prelude::*;
use std::cmp::{max, min};

use gem_common::errors::ErrorCode;
use gem_common::*;

use crate::state::*;

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum FixedRateRewardTier {
    Base,
    Tier1,
    Tier2,
    Tier3,
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TierConfig {
    // tokens / sec
    pub reward_rate: u64,

    pub required_tenure: u64,
}

#[repr(C)]
#[derive(Debug, Copy, Clone, Default, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateSchedule {
    pub base_rate: u64,

    pub tier1: Option<TierConfig>,

    pub tier2: Option<TierConfig>,

    pub tier3: Option<TierConfig>,
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub schedule: FixedRateSchedule,

    pub amount: u64,

    pub duration_sec: u64,
}

// todo test in rust
impl FixedRateSchedule {
    pub fn verify_schedule_invariants(&self) {
        if let Some(t3) = self.tier3 {
            // later tiers require earlier tiers to be present (no gaps)
            assert!(self.tier2.is_some() && self.tier1.is_some());

            // later tenures must be further into the future than earlier tenures
            let t2_tenure = self.tier2.unwrap().required_tenure;
            assert!(t3.required_tenure >= t2_tenure);

            let t1_tenure = self.tier1.unwrap().required_tenure;
            assert!(t2_tenure >= t1_tenure);
        };

        if let Some(t2) = self.tier2 {
            // later tiers require earlier tiers to be present (no gaps)
            assert!(self.tier1.is_some());

            // later tenures must be further into the future than earlier tenures
            let t1_tenure = self.tier1.unwrap().required_tenure;
            assert!(t2.required_tenure >= t1_tenure);
        };

        // rates themselves can be anything, no invariant
    }

    pub fn calc_reward_amount(
        &self,
        start_from_sec: u64,
        end_at_sec: u64,
        gems: u64,
    ) -> Result<u64, ProgramError> {
        // base
        let base_end = if let Some(t1) = self.tier1 {
            t1.required_tenure
        } else {
            end_at_sec
        };
        let base_reward = base_end.try_sub(start_from_sec)?.try_mul(self.base_rate)?;

        // tier 1
        let mut tier1_end = 0;
        let mut tier1_reward = 0;

        if let Some(t1) = self.tier1 {
            tier1_end = if let Some(t2) = self.tier2 {
                t2.required_tenure
            } else {
                end_at_sec
            };
            tier1_reward = tier1_end.try_sub(base_end)?.try_mul(t1.reward_rate)?;
        }

        // tier 2
        let mut tier2_end = 0;
        let mut tier2_reward = 0;

        if let Some(t2) = self.tier2 {
            tier2_end = if let Some(t3) = self.tier3 {
                t3.required_tenure
            } else {
                end_at_sec
            };
            tier2_reward = tier2_end.try_sub(tier2_end)?.try_mul(t2.reward_rate)?;
        }

        // tier 3
        let mut tier3_end = 0;
        let mut tier3_reward = 0;

        if let Some(t3) = self.tier3 {
            tier3_end = end_at_sec;
            tier3_reward = tier3_end.try_sub(tier3_end)?.try_mul(t3.reward_rate)?;
        }

        gems.try_mul(
            base_reward
                .try_add(tier1_reward)?
                .try_add(tier2_reward)?
                .try_add(tier3_reward)?,
        )
    }
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateReward {
    // configured on funding
    pub schedule: FixedRateSchedule,

    // amount that has been promised to existing stakers and hence can't be withdrawn
    pub reserved_amount: u64,
}

impl FixedRateReward {
    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        new_config: FixedRateConfig,
    ) -> ProgramResult {
        let FixedRateConfig {
            schedule,
            amount,
            duration_sec,
        } = new_config;

        schedule.verify_schedule_invariants();

        times.duration_sec = duration_sec;
        times.reward_end_ts = now_ts.try_add(duration_sec)?;

        funds.total_funded.try_add_assign(amount)?;

        msg!("recorded new funding of {}", amount);
        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64, ProgramError> {
        let refund_amount = funds.pending_amount()?.try_sub(self.reserved_amount)?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        times.end_reward(now_ts)?;

        msg!("prepared a total refund of {}", refund_amount);
        Ok(refund_amount)
    }

    // todo need logic for when they want to keep themselves staked
    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        times: &TimeTracker,
        funds: &mut FundsTracker,
        farmer_gems_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> ProgramResult {
        let newly_accrued_reward = farmer_reward
            .fixed_rate
            .newly_accrued_reward(now_ts, farmer_gems_staked)?;

        // update farm (move from reserved to accrued)
        funds
            .total_accrued_to_stakers
            .try_add_assign(newly_accrued_reward)?;
        self.reserved_amount.try_sub_assign(newly_accrued_reward)?;

        // update farmer
        farmer_reward.update_fixed_reward(now_ts, newly_accrued_reward)?;

        if farmer_reward.fixed_rate.is_graduation_time(now_ts)? {
            self.graduate_farmer(now_ts, farmer_gems_staked, farmer_reward)?
        }

        msg!("updated reward as of {}", now_ts);
        Ok(())
    }

    pub fn enroll_farmer(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        farmer_gems_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> ProgramResult {
        // calc time left
        let remaining_duration = times.remaining_duration(now_ts)?;
        // todo is this consistent with how variable rate works?
        if remaining_duration == 0 {
            return Err(ErrorCode::RewardEnded.into());
        }

        // calc how much we'd have to reserve for them
        let reserve_amount =
            self.schedule
                .calc_reward_amount(0, remaining_duration, farmer_gems_staked)?;
        if reserve_amount > funds.pending_amount()? {
            return Err(ErrorCode::RewardUnderfunded.into());
        }

        // update farmer
        farmer_reward.fixed_rate.begin_staking_ts = now_ts;
        farmer_reward.fixed_rate.last_updated_ts = now_ts;
        farmer_reward.fixed_rate.promised_schedule = self.schedule;
        farmer_reward.fixed_rate.promised_duration = remaining_duration;
        farmer_reward.fixed_rate.reward_counted_as_accrued = 0;

        // update farm
        self.reserved_amount.try_add_assign(reserve_amount)?;

        msg!("enrolled farmer as of {}", now_ts);
        Ok(())
    }

    /// this can be called either
    /// 1) todo by the staker themselves, when they unstake, or
    /// 2) by the farm if graduation_time has come
    pub fn graduate_farmer(
        &mut self,
        now_ts: u64,
        farmer_gems_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> ProgramResult {
        // reduce reserved amount
        let voided_reward = farmer_reward.fixed_rate.voided_reward(farmer_gems_staked)?;
        self.reserved_amount.try_sub_assign(voided_reward)?;

        // zero out the data on the farmer
        farmer_reward.fixed_rate = FarmerFixedRateReward::default();

        msg!("graduated farmer on {}", now_ts);
        Ok(())
    }
}
