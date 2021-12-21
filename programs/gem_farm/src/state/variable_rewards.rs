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

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateReward {
    // configured on funding
    config: VariableRateConfig,

    // in tokens/s, = total reward pot at initialization / reward duration
    pub reward_rate: u64,

    pub reward_last_updated_ts: u64,

    // this is somewhat redundant with total_accrued_to_stakers in funds, but necessary
    // think of it as a "flag in the ground" that gets moved forward as more rewards accrue to the pool
    // when a farmer tries to figure out how much they're due from the pool, we:
    // 1) compare their latest record of flag position, with actual flag position
    // 2) multiply the difference by the amount they have staked
    // 3) update their record of flag position, so that next time we don't count this distance again
    pub accrued_reward_per_gem: u64,
}

impl VariableRateReward {
    fn required_remaining_funding(&self, remaining_duration: u64) -> Result<u64, ProgramError> {
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

        msg!("locked reward up to {}", times.reward_end_ts);
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

        funds.total_funded.try_add_assign(amount)?;

        self.config = new_config;
        self.reward_last_updated_ts = times.reward_upper_bound(now_ts);

        msg!("recorded new funding of {}", amount);
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
        self.reward_last_updated_ts = times.reward_upper_bound(now_ts);

        msg!("prepared a total refund of {}", refund_amount);
        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        funds: &mut FundsTracker,
        times: &TimeTracker,
        farm_gems_staked: u64,
        farmer_gems_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerReward>,
    ) -> ProgramResult {
        let reward_upper_bound = times.reward_upper_bound(now_ts);

        // calc & update reward per gem
        let newly_accrued_reward_per_gem =
            self.newly_accrued_reward_per_gem(farm_gems_staked, reward_upper_bound)?;

        self.accrued_reward_per_gem
            .try_add_assign(newly_accrued_reward_per_gem)?;

        // update overall reward
        funds
            .total_accrued_to_stakers
            .try_add_assign(newly_accrued_reward_per_gem.try_mul(farm_gems_staked)?)?;

        // update farmer, if one was passed
        if let Some(farmer_reward) = farmer_reward {
            let owed_to_farmer = farmer_gems_staked.unwrap().try_mul(
                self.accrued_reward_per_gem
                    .try_sub(farmer_reward.last_recorded_accrued_reward_per_gem)?,
            )?;

            farmer_reward
                .accrued_reward
                .try_add_assign(owed_to_farmer)?;
            farmer_reward.last_recorded_accrued_reward_per_gem = self.accrued_reward_per_gem;
        }

        self.reward_last_updated_ts = reward_upper_bound;

        msg!("updated reward as of {}", self.reward_last_updated_ts);
        Ok(())
    }

    fn newly_accrued_reward_per_gem(
        &self,
        farm_gems_staked: u64,
        reward_upper_bound: u64,
    ) -> Result<u64, ProgramError> {
        if farm_gems_staked == 0 {
            msg!("no gems are staked at the farm, means no new rewards accrue");
            return Ok(0);
        }

        let time_since_last_calc = reward_upper_bound.try_sub(self.reward_last_updated_ts)?;

        time_since_last_calc
            .try_mul(self.reward_rate)?
            .try_div(farm_gems_staked)
    }
}
