use anchor_lang::prelude::*;

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

    pub premium_tier: Option<TierConfig>,

    pub godlike_tier: Option<TierConfig>,
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub schedule: FixedRateSchedule,

    pub amount: u64,

    pub duration_sec: u64,
}

impl FixedRateSchedule {
    // eg begin 2 seconds in, and end 5 seconds in
    pub fn calc_amount(
        &self,
        start_from_sec: u64,
        end_at_sec: u64,
        gems: u64,
    ) -> Result<u64, ProgramError> {
        // todo = schedule * (duration - start_sec)
        let duration = end_at_sec.try_sub(start_from_sec)?;
        let base_amount = duration.try_mul(self.base_rate)?;

        if let Some(premium_tier) = self.premium_tier {}

        Ok(123)
    }
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateReward {
    // configured on funding
    pub config: FixedRateConfig,

    // amount that has been promised to existing stakers and hence can't be withdrawn
    pub reserved_amount: u64,
}

impl FixedRateReward {
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
        if !remaining_duration {
            return Err(ErrorCode::RewardEnded.into());
        }

        // calc how much we'd have to reserve for them
        let reserve_amount =
            self.config
                .schedule
                .calc_amount(0, remaining_duration, farmer_gems_staked)?;
        if reserve_amount > funds.pending_amount()? {
            return Err(ErrorCode::RewardUnderfunded.into());
        }

        // update farmer
        farmer_reward.fixed_rate.begin_staking_ts = now_ts;
        farmer_reward.fixed_rate.last_updated_ts = now_ts;
        farmer_reward.fixed_rate.promised_schedule = self.config.schedule;
        farmer_reward.fixed_rate.promised_duration = remaining_duration;
        farmer_reward.fixed_rate.amount_counted_as_accrued = 0;

        // update farm
        self.reserved_amount.try_add_assign(reserve_amount)?;

        Ok(())
    }

    /// this can be called either
    /// 1) by the staker themselves, when they unstake, or
    /// 2) by the farm if graduation_time has come
    pub fn graduate_farmer(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        farmer_gems_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> ProgramResult {
        // reduce reserved amount
        let voided_reward = farmer_reward.fixed_rate.voided_reward(farmer_gems_staked)?;
        self.reserved_amount.try_sub_assign(voided_reward)?;

        // zero out the data on the farmer
        farmer_reward.fixed_rate = FarmerFixedRateReward::default();

        Ok(())
    }

    pub fn lock_reward(
        &self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> ProgramResult {
        //todo no checks will be done here - we're simply promising an amount until reward_end_ts can't be withdrawn
        // does the check in variable rate actually do any good?

        times.lock_end_ts = times.reward_end_ts;

        msg!("locked reward up to {}", times.reward_end_ts);
        Ok(())
    }

    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        new_config: FixedRateConfig,
    ) -> ProgramResult {
        let new_amount = new_config.amount;
        let new_duration = new_config.duration_sec;

        times.duration_sec = new_duration;
        times.reward_end_ts = now_ts.try_add(new_duration)?;

        funds.total_funded.try_add_assign(new_amount)?;

        self.config = new_config;

        msg!("recorded new funding of {}", new_amount);
        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64, ProgramError> {
        times.end_reward(now_ts)?;

        let refund_amount = funds.pending_amount()?.try_sub(self.reserved_amount)?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        msg!("prepared a total refund of {}", refund_amount);
        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        farmer_gems_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> ProgramResult {
        let newly_accrued_reward = farmer_reward
            .fixed_rate
            .newly_accrued_reward(now_ts, farmer_gems_staked)?;

        // update farm
        funds
            .total_accrued_to_stakers
            .try_add_assign(newly_accrued_reward)?;
        self.reserved_amount.try_sub_assign(newly_accrued_reward)?;

        // todo should this be a function called on farmer?
        // update farmer
        farmer_reward
            .accrued_reward
            .try_add_assign(newly_accrued_reward)?;
        farmer_reward
            .fixed_rate
            .reward_counted_as_accrued
            .try_add_assign(newly_accrued_reward)?;
        farmer_reward.fixed_rate.last_updated_ts =
            farmer_reward.fixed_rate.upper_bound_ts(now_ts)?;

        if farmer_reward.fixed_rate.is_graduation_time(now_ts)? {
            self.graduate_farmer(now_ts, times, funds, farmer_gems_staked, farmer_reward)?
        }

        msg!("updated reward as of {}", now_ts);
        Ok(())
    }
}
