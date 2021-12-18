use anchor_lang::prelude::*;

use gem_common::errors::ErrorCode;
use gem_common::*;

use crate::state::*;

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PeriodConfig {
    // tokens / sec
    pub rate: u64,

    pub duration: u64,
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub period_1: PeriodConfig,

    pub period_2: Option<PeriodConfig>,

    pub period_3: Option<PeriodConfig>,

    pub gems_funded: u64,
}

impl FixedRateConfig {
    /// all periods must be SHORTER than reward duration
    /// this is to make sure users get paid out what they're promised
    fn assert_sufficient_duration(&self, reward_duration: u64) -> ProgramResult {
        let period_1_duration = self.period_1.duration;
        let period_2_duration = if let Some(config) = self.period_2 {
            config.duration
        } else {
            0
        };
        let period_3_duration = if let Some(config) = self.period_3 {
            config.duration
        } else {
            0
        };

        let total_period_duration = period_1_duration
            .try_add(period_2_duration)?
            .try_add(period_3_duration)?;

        assert!(total_period_duration <= reward_duration);

        Ok(())
    }

    fn funding_required(&self) -> Result<u64, ProgramError> {
        let period_1_funding = self.period_1.rate.try_mul(self.period_1.duration)?;

        let period_2_funding = if let Some(config) = self.period_2 {
            config.rate.try_mul(config.duration)?
        } else {
            0
        };

        let period_3_funding = if let Some(config) = self.period_3 {
            config.rate.try_mul(config.duration)?
        } else {
            0
        };

        let total_per_gem = period_1_funding
            .try_add(period_2_funding)?
            .try_add(period_3_funding)?;

        self.gems_funded.try_mul(total_per_gem)
    }
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateTracker {
    pub config: FixedRateConfig,

    // funding - defunding
    pub net_reward_funding: u64,

    // can only go up, never down
    pub total_accrued_to_stakers: u64,

    // can only go up, never down - that's the difference with gems_staked
    pub gems_participating: u64,

    // can only go up, never down
    pub gems_made_whole: u64,
}

impl FixedRateTracker {
    pub fn assert_sufficient_funding(&self) -> ProgramResult {
        assert!(self.config.funding_required()? <= self.net_reward_funding);

        Ok(())
    }

    pub fn fund_reward(
        &mut self,
        new_amount: u64,
        new_duration_sec: u64,
        config: FixedRateConfig,
    ) -> ProgramResult {
        // verify + assign the new config
        config.assert_sufficient_duration(new_duration_sec)?;
        self.config = config;

        // update reward
        self.net_reward_funding.try_add_assign(new_amount)
    }

    pub fn defund_reward(
        &mut self,
        desired_amount: u64,
        funder_withdrawable_amount: u64,
    ) -> Result<u64, ProgramError> {
        //can only be done once all participating gems are made whole
        if self.gems_made_whole < self.gems_participating {
            return Err(ErrorCode::NotAllGemsWhole.into());
        }

        // calc how much is actually available for defunding
        let unaccrued_reward = self.calc_unaccrued_reward()?;

        let mut to_defund = std::cmp::min(unaccrued_reward, desired_amount);
        to_defund = std::cmp::min(to_defund, funder_withdrawable_amount);

        // update reward
        self.net_reward_funding.try_sub_assign(to_defund)?;

        Ok(to_defund)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        reward_end_ts: u64,
        reward_upper_bound_ts: u64,
        farmer_gems_staked: u64,
        farmer_begin_staking_ts: u64,
        farmer_reward: &mut FarmerRewardTracker, // only ran when farmer present
    ) -> ProgramResult {
        if farmer_reward.is_whole() {
            msg!("this farmer reward is already made whole, no further changes expected");
            return Ok(());
        }

        // calc new, updated reward
        let farmer_reward_per_gem =
            self.calc_accrued_reward_per_gem(farmer_begin_staking_ts, reward_upper_bound_ts)?;
        let recalculated_farmer_reward = farmer_reward_per_gem.try_mul(farmer_gems_staked)?;

        // update farmer
        let old_farmer_reward = farmer_reward.accrued_reward;
        farmer_reward.accrued_reward = recalculated_farmer_reward;

        // update farm
        let difference = recalculated_farmer_reward.try_sub(old_farmer_reward)?;
        self.total_accrued_to_stakers.try_add_assign(difference)?;

        // after reward end passes, we won't owe any more money to the farmer than calculated now
        if now_ts > reward_end_ts {
            farmer_reward.mark_whole();
            self.gems_made_whole.try_add_assign(farmer_gems_staked)?;
        }

        Ok(())
    }

    fn calc_unaccrued_reward(&self) -> Result<u64, ProgramError> {
        if self.net_reward_funding < self.total_accrued_to_stakers {
            return Err(ErrorCode::RewardUnderfunded.into());
        }

        self.net_reward_funding
            .try_sub(self.total_accrued_to_stakers)
    }

    fn calc_accrued_reward_per_gem(
        &self,
        begin_staking_ts: u64,
        end_staking_ts: u64,
    ) -> Result<u64, ProgramError> {
        //todo is this the right place? what other checks of this type are necessary?
        if begin_staking_ts > end_staking_ts {
            return Ok(0);
        }

        // period 1 alc
        let p1_duration = std::cmp::min(
            self.config.period_1.duration,
            end_staking_ts.try_sub(begin_staking_ts)?,
        );
        let p1_reward = self.config.period_1.rate.try_mul(p1_duration)?;

        // period 2 calc
        let mut p2_duration = 0;
        let mut p2_reward = 0;

        if let Some(config) = self.config.period_2 {
            p2_duration = std::cmp::min(
                config.duration,
                end_staking_ts
                    .try_sub(begin_staking_ts)?
                    .try_sub(p1_duration)?,
            );
            p2_reward = config.rate.try_mul(p2_duration)?;
        }

        // period 3 calc
        let mut p3_reward = 0;

        if let Some(config) = self.config.period_3 {
            let p3_duration = std::cmp::min(
                config.duration,
                end_staking_ts
                    .try_sub(begin_staking_ts)?
                    .try_sub(p1_duration)?
                    .try_sub(p2_duration)?,
            );
            p3_reward = config.rate.try_mul(p3_duration)?;
        }

        p1_reward.try_add(p2_reward)?.try_add(p3_reward)
    }
}
