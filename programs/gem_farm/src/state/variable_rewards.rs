use anchor_lang::prelude::*;

use gem_common::errors::ErrorCode;
use gem_common::*;

use crate::state::*;

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateConfig {
    // total amount of rewards
    pub amount: u64,

    // over which period it's active
    pub duration_sec: u64,
}

impl VariableRateConfig {}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateReward {
    // configured on funding
    config: VariableRateConfig,

    // in tokens/s, = total reward pot at initialization / reward duration
    pub reward_rate: u64,

    pub reward_last_updated_ts: u64,
}

impl VariableRateReward {
    pub fn required_remaining_funding(&self, remaining_duration: u64) -> Result<u64, ProgramError> {
        remaining_duration.try_mul(self.reward_rate)
    }

    pub fn lock_reward(
        &self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> ProgramResult {
        let remaining_duration = times.remaining_duration(now_ts)?;

        if funds.pending_amount()? < self.required_remaining_funding(remaining_duration)? {
            return Err(ErrorCode::RewardUnderfunded.into());
        }

        times.lock_end_ts = times.reward_end_ts;

        Ok(())
    }

    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        new_config: VariableRateConfig,
    ) -> ProgramResult {
        let VariableRateConfig {
            amount,
            duration_sec,
        } = new_config;

        // if previous rewards have been exhausted
        if now_ts > times.reward_end_ts {
            self.reward_rate = amount.try_div(duration_sec)?;
        // else if previous rewards are still active (merge the two)
        } else {
            self.reward_rate = amount
                .try_add(funds.pending_amount()?)?
                .try_div(duration_sec)?;
        }

        times.duration_sec = duration_sec;
        times.reward_end_ts = now_ts.try_add(duration_sec)?;

        funds.total_funded.try_add_assign(amount);

        self.config = new_config;
        self.reward_last_updated_ts = now_ts;

        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64, ProgramError> {
        times.end_reward(now_ts)?;

        let refund_amount = funds.pending_amount()?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        self.reward_rate = 0;
        self.reward_last_updated_ts = now_ts;

        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        funds: &mut FundsTracker,
        times: &TimeTracker,
        farm_gems_staked: u64,
        farmer_gems_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerRewardTracker>,
    ) -> ProgramResult {
        // applies to variable rewards ONLY, do not move up
        if times.upper_bound(now_ts) <= self.reward_last_updated_ts {
            msg!("this reward has ended OR not enough time passed since last update");
            return Ok(());
        }

        let newly_accrued_reward =
            self.calc_newly_accrued_reward(farm_gems_staked, times.upper_bound(now_ts))?;

        funds
            .total_accrued_to_stakers
            .try_add_assign(newly_accrued_reward)?;

        // update farmer, if one has been passed
        if let Some(farmer_reward) = farmer_reward {
            farmer_reward.accrued_reward.try_add_assign(
                newly_accrued_reward
                    .try_mul(farmer_gems_staked.unwrap())?
                    .try_div(farm_gems_staked)?,
            )?;
        }

        self.reward_last_updated_ts = now_ts;

        Ok(())
    }

    fn calc_newly_accrued_reward(
        &self,
        farm_gems_staked: u64,
        reward_upper_bound_ts: u64,
    ) -> Result<u64, ProgramError> {
        // if no gems staked, no new reward accrues, hence return 0
        if farm_gems_staked == 0 {
            return Ok(0);
        }

        self.reward_rate
            .try_mul(reward_upper_bound_ts.try_sub(self.reward_last_updated_ts)?)
    }
}
