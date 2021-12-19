use anchor_lang::prelude::*;

use gem_common::*;

use crate::state::*;

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateConfig {
    // total amount of rewards
    pub amount: u64,

    // over which period it's active
    pub duration_sec: u64,
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateTracker {
    // in tokens/s, = total reward pot at initialization / reward duration
    pub reward_rate: u64,

    // this is cumulative, since the beginning of time
    pub accrued_reward_per_gem: u64,
}

impl VariableRateTracker {
    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        current_reward_end_ts: u64,
        variable_rate_config: VariableRateConfig,
    ) -> ProgramResult {
        let VariableRateConfig {
            amount,
            duration_sec,
        } = variable_rate_config;

        // if previous rewards have been exhausted
        if now_ts > current_reward_end_ts {
            self.reward_rate = amount.try_div(duration_sec)?;
        // else if previous rewards are still active (merge the two)
        } else {
            let remaining_duration_sec = current_reward_end_ts.try_sub(now_ts)?;
            let remaining_amount = remaining_duration_sec.try_mul(self.reward_rate)?;

            self.reward_rate = amount.try_add(remaining_amount)?.try_div(duration_sec)?;
        }

        Ok(())
    }

    pub fn defund_reward(
        &mut self,
        now_ts: u64,
        reward_end_ts: u64,
        desired_amount: u64,
        new_duration_sec: Option<u64>,
        funder_withdrawable_amount: u64,
    ) -> Result<u64, ProgramError> {
        // calc how much is actually available for defunding
        let unaccrued_reward = self.calc_unaccrued_reward(now_ts, reward_end_ts)?;

        let mut to_defund = std::cmp::min(unaccrued_reward, desired_amount);
        to_defund = std::cmp::min(to_defund, funder_withdrawable_amount);

        // update reward
        let remaining_reward = unaccrued_reward.try_sub(to_defund)?;

        if let Some(new_duration_sec) = new_duration_sec {
            self.reward_rate = remaining_reward.try_div(new_duration_sec)?;
        } else {
            self.reward_rate = remaining_reward.try_div(reward_end_ts.try_sub(now_ts)?)?;
        }

        Ok(to_defund)
    }

    pub fn update_accrued_reward(
        &mut self,
        reward_upper_bound_ts: u64,
        rewards_last_updated_ts: u64,
        farm_gems_staked: u64,
        farmer_gems_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerRewardTracker>,
    ) -> ProgramResult {
        // applies to variable rewards ONLY, do not move up
        if reward_upper_bound_ts <= rewards_last_updated_ts {
            msg!("this reward has ended OR not enough time passed since last update");
            return Ok(());
        }

        let newly_accrued_reward_per_gem = self.calc_newly_accrued_reward_per_gem(
            farm_gems_staked,
            reward_upper_bound_ts,
            rewards_last_updated_ts,
        )?;

        // update farm
        self.accrued_reward_per_gem
            .try_add_assign(newly_accrued_reward_per_gem)?;

        // update farmer, if one has been passed
        if let Some(farmer_reward) = farmer_reward {
            farmer_reward.accrued_reward.try_add_assign(
                newly_accrued_reward_per_gem.try_mul(farmer_gems_staked.unwrap())?,
            )?;
        }

        Ok(())
    }

    fn calc_unaccrued_reward(&self, now_ts: u64, reward_end_ts: u64) -> Result<u64, ProgramError> {
        // if reward end has passed, the entire amount has accrued and nothing is available for defunding
        if reward_end_ts <= now_ts {
            return Ok(0);
        }

        self.reward_rate.try_mul(reward_end_ts.try_sub(now_ts)?)
    }

    fn calc_newly_accrued_reward_per_gem(
        &self,
        farm_gems_staked: u64,
        reward_upper_bound_ts: u64,
        rewards_last_updated_ts: u64,
    ) -> Result<u64, ProgramError> {
        // if no gems staked, no new reward accrues, hence return 0
        if farm_gems_staked == 0 {
            return Ok(0);
        }

        let time_since_last_calc_sec = reward_upper_bound_ts.try_sub(rewards_last_updated_ts)?;

        time_since_last_calc_sec
            .try_mul(self.reward_rate)?
            .try_div(farm_gems_staked)
    }
}
