use anchor_lang::prelude::*;

use gem_common::errors::ErrorCode;
use gem_common::*;

use crate::state::*;

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PeriodConfig {
    // tokens / sec
    pub rate: u64,

    pub duration_sec: u64,
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub period_1: PeriodConfig,

    pub period_2: Option<PeriodConfig>,

    pub period_3: Option<PeriodConfig>,

    pub gems_funded: u64,
}

impl FixedRateConfig {
    pub fn calc_max_duration(&self) -> Result<u64, ProgramError> {
        let period_1_duration = self.period_1.duration_sec;
        let period_2_duration = if let Some(config) = self.period_2 {
            config.duration_sec
        } else {
            0
        };
        let period_3_duration = if let Some(config) = self.period_3 {
            config.duration_sec
        } else {
            0
        };

        period_1_duration
            .try_add(period_2_duration)?
            .try_add(period_3_duration)
    }

    pub fn calc_max_reward_per_gem(&self) -> Result<u64, ProgramError> {
        let p1_reward = self.period_1.rate.try_mul(self.period_1.duration_sec)?;

        let p2_reward = if let Some(config) = self.period_2 {
            config.rate.try_mul(config.duration_sec)?
        } else {
            0
        };

        let p3_reward = if let Some(config) = self.period_3 {
            config.rate.try_mul(config.duration_sec)?
        } else {
            0
        };

        p1_reward.try_add(p2_reward)?.try_add(p3_reward)
    }

    pub fn calc_required_funding(&self) -> Result<u64, ProgramError> {
        self.gems_funded.try_mul(self.calc_max_reward_per_gem()?)
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
        if self.config.calc_required_funding()? > self.net_reward_funding {
            return Err(ErrorCode::RewardUnderfunded.into());
        }

        Ok(())
    }

    pub fn fund_reward(&mut self, config: FixedRateConfig) -> ProgramResult {
        // update config
        self.config = config;

        // update total funding
        self.net_reward_funding
            .try_add_assign(config.calc_required_funding()?)
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

        let staking_duration = end_staking_ts.try_sub(begin_staking_ts)?;

        // period 1 alc
        let p1_duration = std::cmp::min(self.config.period_1.duration_sec, staking_duration);
        let p1_reward = self.config.period_1.rate.try_mul(p1_duration)?;

        msg!("p1 dur/rew {} {}", p1_duration, p1_reward);

        // period 2 calc
        let mut p2_duration = 0;
        let mut p2_reward = 0;

        if let Some(config) = self.config.period_2 {
            p2_duration =
                std::cmp::min(config.duration_sec, staking_duration.try_sub(p1_duration)?);
            p2_reward = config.rate.try_mul(p2_duration)?;
        }

        msg!("p2 dur/rew {} {}", p2_duration, p2_reward);

        // period 3 calc
        let mut p3_duration = 0;
        let mut p3_reward = 0;

        if let Some(config) = self.config.period_3 {
            p3_duration = std::cmp::min(
                config.duration_sec,
                staking_duration
                    .try_sub(p1_duration)?
                    .try_sub(p2_duration)?,
            );
            p3_reward = config.rate.try_mul(p3_duration)?;
        }

        msg!("p3 dur/rew {} {}", p3_duration, p3_reward);

        let accrued_duration = p1_duration.try_add(p2_duration)?.try_add(p3_duration)?;
        let accrued_reward_per_gem = p1_reward.try_add(p2_reward)?.try_add(p3_reward)?;

        assert!(accrued_duration <= self.config.calc_max_duration()?);
        assert!(accrued_reward_per_gem <= self.config.calc_max_reward_per_gem()?);

        Ok(accrued_reward_per_gem)
    }
}
