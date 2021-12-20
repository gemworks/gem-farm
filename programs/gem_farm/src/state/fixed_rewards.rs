use anchor_lang::prelude::*;

use gem_common::errors::ErrorCode;
use gem_common::*;

use crate::state::*;

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct PeriodConfig {
    // tokens / sec
    pub rate: u64,

    pub duration_sec: u64,
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub period_1: PeriodConfig,

    pub period_2: Option<PeriodConfig>,

    pub period_3: Option<PeriodConfig>,

    pub gems_funded: u64,
}

impl FixedRateConfig {
    fn max_duration(&self) -> Result<u64, ProgramError> {
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

    fn max_reward_per_gem(&self) -> Result<u64, ProgramError> {
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

    fn accrued_reward_per_gem(&self, duration: u64) -> Result<u64, ProgramError> {
        // period 1 alc
        let p1_duration = std::cmp::min(self.period_1.duration_sec, duration);
        let p1_reward = self.period_1.rate.try_mul(p1_duration)?;

        // period 2 calc
        let mut p2_duration = 0;
        let mut p2_reward = 0;

        if let Some(config) = self.period_2 {
            p2_duration = std::cmp::min(config.duration_sec, duration.try_sub(p1_duration)?);
            p2_reward = config.rate.try_mul(p2_duration)?;
        }

        // period 3 calc
        let mut p3_duration = 0;
        let mut p3_reward = 0;

        if let Some(config) = self.period_3 {
            p3_duration = std::cmp::min(
                config.duration_sec,
                duration.try_sub(p1_duration)?.try_sub(p2_duration)?,
            );
            p3_reward = config.rate.try_mul(p3_duration)?;
        }

        let accrued_duration = p1_duration.try_add(p2_duration)?.try_add(p3_duration)?;
        let accrued_reward_per_gem = p1_reward.try_add(p2_reward)?.try_add(p3_reward)?;

        assert!(accrued_duration <= self.max_duration()?);
        assert!(accrued_reward_per_gem <= self.max_reward_per_gem()?);

        Ok(accrued_reward_per_gem)
    }

    fn remaining_reward_per_gem(&self, passed_duration: u64) -> Result<u64, ProgramError> {
        self.max_reward_per_gem()?
            .try_sub(self.accrued_reward_per_gem(passed_duration)?)
    }

    fn remaining_required_funding(&self, passed_duration: u64) -> Result<u64, ProgramError> {
        self.remaining_reward_per_gem(passed_duration)?
            .try_mul(self.gems_funded)
    }

    pub fn required_funding(&self) -> Result<u64, ProgramError> {
        self.max_reward_per_gem()?.try_mul(self.gems_funded)
    }
}

#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateReward {
    // configured on funding
    pub config: FixedRateConfig,

    // can only go up, never down - that's the difference with gems_staked
    pub gems_participating: u64,

    /// this solves a fixed rate-specific issue.
    /// in var. rate we know exactly how much total unaccrued funding is left,
    ///  because the accrual rate for the reward as a whole is constant
    /// in fixed rate we don't. This makes cancelling the reward / refunding hard,
    ///  because how do we know we're not pulling out too much
    /// the solution is to mark certain gems that we know won't accrue anymore rewards as "whole"
    /// only when ALL participating gems are whole, can the reward be cancelled / funding withdrawn  
    pub gems_made_whole: u64,
}

impl FixedRateReward {
    pub fn lock_reward(
        &self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> ProgramResult {
        let passed_duration = times.passed_duration(now_ts)?;

        if funds.pending_amount()? < self.config.remaining_required_funding(passed_duration)? {
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
        new_config: FixedRateConfig,
    ) -> ProgramResult {
        times.duration_sec = new_config.max_duration()?;
        times.reward_end_ts = now_ts.try_add(new_config.max_duration()?)?;

        funds
            .total_funded
            .try_add_assign(new_config.required_funding()?)?;

        self.config = new_config;

        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64, ProgramError> {
        if self.gems_made_whole < self.gems_participating {
            return Err(ErrorCode::NotAllGemsWhole.into());
        }

        times.end_reward(now_ts)?;

        let refund_amount = funds.pending_amount()?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        funds: &mut FundsTracker,
        times: &TimeTracker,
        farmer_gems_staked: u64,
        farmer_begin_staking_ts: u64,
        farmer_reward: &mut FarmerRewardTracker, // only ran when farmer present
    ) -> ProgramResult {
        if farmer_reward.is_whole() {
            msg!("this farmer reward is already made whole, no further changes expected");
            return Ok(());
        }

        //todo is this the right place? what other checks of this type are necessary?
        if farmer_begin_staking_ts > times.upper_bound(now_ts) {
            return Ok(());
        }

        // calc new, updated reward
        let staking_duration = times.upper_bound(now_ts).try_sub(farmer_begin_staking_ts)?;
        let farmer_reward_per_gem = self.config.accrued_reward_per_gem(staking_duration)?;
        let total_farmer_reward = farmer_reward_per_gem.try_mul(farmer_gems_staked)?;

        // update farmer
        let old_farmer_reward = farmer_reward.accrued_reward;
        farmer_reward.accrued_reward = total_farmer_reward;

        // update farm
        let difference = total_farmer_reward.try_sub(old_farmer_reward)?;
        funds.total_accrued_to_stakers.try_add_assign(difference)?;

        // after reward end passes, we won't owe any more money to the farmer than calculated now
        if now_ts > times.reward_end_ts {
            farmer_reward.mark_whole();
            self.gems_made_whole.try_add_assign(farmer_gems_staked)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_config() {
        let c = FixedRateConfig {
            period_1: PeriodConfig {
                rate: 3,
                duration_sec: 3,
            },
            period_2: Some(PeriodConfig {
                rate: 4,
                duration_sec: 4,
            }),
            period_3: Some(PeriodConfig {
                rate: 5,
                duration_sec: 5,
            }),
            gems_funded: 100,
        };

        // test max_duration
        let total_duration = 3 + 4 + 5;
        assert_eq!(total_duration, c.max_duration().unwrap());

        // test max_reward_per_gem
        let total_rewards = (3 * 3) + (4 * 4) + (5 * 5);
        assert_eq!(total_rewards, c.max_reward_per_gem().unwrap());

        //test required_funding
        assert_eq!(total_rewards * 100, c.required_funding().unwrap());

        // test accrued_reward_per_gem
        let duration_p1 = 2;
        let reward_p1 = 2 * 3;
        assert_eq!(reward_p1, c.accrued_reward_per_gem(duration_p1).unwrap());

        let duration_p2 = 5;
        let reward_p2 = (3 * 3) + 2 * 4;
        assert_eq!(reward_p2, c.accrued_reward_per_gem(duration_p2).unwrap());

        let duration_p3 = 9;
        let reward_p3 = (3 * 3) + (4 * 4) + 2 * 5;
        assert_eq!(reward_p3, c.accrued_reward_per_gem(duration_p3).unwrap());

        let duration_too_long = 100;
        assert_eq!(
            total_rewards,
            c.accrued_reward_per_gem(duration_too_long).unwrap()
        );

        // test remaining_reward_per_gem
        assert_eq!(
            total_rewards - reward_p1,
            c.remaining_reward_per_gem(duration_p1).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p2,
            c.remaining_reward_per_gem(duration_p2).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p3,
            c.remaining_reward_per_gem(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_reward_per_gem(duration_too_long).unwrap());

        // test remaining_required_funding
        assert_eq!(
            100 * (total_rewards - reward_p1),
            c.remaining_required_funding(duration_p1).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p2),
            c.remaining_required_funding(duration_p2).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p3),
            c.remaining_required_funding(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_required_funding(duration_too_long).unwrap());
    }

    #[test]
    fn test_p2_config() {
        let c = FixedRateConfig {
            period_1: PeriodConfig {
                rate: 3,
                duration_sec: 3,
            },
            period_2: Some(PeriodConfig {
                rate: 4,
                duration_sec: 4,
            }),
            period_3: None,
            gems_funded: 100,
        };

        // test max_duration
        let total_duration = 3 + 4;
        assert_eq!(total_duration, c.max_duration().unwrap());

        // test max_reward_per_gem
        let total_rewards = (3 * 3) + (4 * 4);
        assert_eq!(total_rewards, c.max_reward_per_gem().unwrap());

        //test required_funding
        assert_eq!(total_rewards * 100, c.required_funding().unwrap());

        // test accrued_reward_per_gem
        let duration_p1 = 2;
        let reward_p1 = 2 * 3;
        assert_eq!(reward_p1, c.accrued_reward_per_gem(duration_p1).unwrap());

        let duration_p2 = 5;
        let reward_p2 = (3 * 3) + 2 * 4;
        assert_eq!(reward_p2, c.accrued_reward_per_gem(duration_p2).unwrap());

        let duration_p3 = 9;
        let reward_p3 = (3 * 3) + (4 * 4);
        assert_eq!(reward_p3, c.accrued_reward_per_gem(duration_p3).unwrap());

        let duration_too_long = 100;
        assert_eq!(
            total_rewards,
            c.accrued_reward_per_gem(duration_too_long).unwrap()
        );

        // test remaining_reward_per_gem
        assert_eq!(
            total_rewards - reward_p1,
            c.remaining_reward_per_gem(duration_p1).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p2,
            c.remaining_reward_per_gem(duration_p2).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p3,
            c.remaining_reward_per_gem(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_reward_per_gem(duration_too_long).unwrap());

        // test remaining_required_funding
        assert_eq!(
            100 * (total_rewards - reward_p1),
            c.remaining_required_funding(duration_p1).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p2),
            c.remaining_required_funding(duration_p2).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p3),
            c.remaining_required_funding(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_required_funding(duration_too_long).unwrap());
    }

    #[test]
    fn test_p1_config() {
        let c = FixedRateConfig {
            period_1: PeriodConfig {
                rate: 3,
                duration_sec: 3,
            },
            period_2: None,
            period_3: None,
            gems_funded: 100,
        };

        // test max_duration
        let total_duration = 3;
        assert_eq!(total_duration, c.max_duration().unwrap());

        // test max_reward_per_gem
        let total_rewards = 3 * 3;
        assert_eq!(total_rewards, c.max_reward_per_gem().unwrap());

        //test required_funding
        assert_eq!(total_rewards * 100, c.required_funding().unwrap());

        // test accrued_reward_per_gem
        let duration_p1 = 2;
        let reward_p1 = 2 * 3;
        assert_eq!(reward_p1, c.accrued_reward_per_gem(duration_p1).unwrap());

        let duration_p2 = 5;
        let reward_p2 = 3 * 3;
        assert_eq!(reward_p2, c.accrued_reward_per_gem(duration_p2).unwrap());

        let duration_p3 = 9;
        let reward_p3 = 3 * 3;
        assert_eq!(reward_p3, c.accrued_reward_per_gem(duration_p3).unwrap());

        let duration_too_long = 100;
        assert_eq!(
            total_rewards,
            c.accrued_reward_per_gem(duration_too_long).unwrap()
        );

        // test remaining_reward_per_gem
        assert_eq!(
            total_rewards - reward_p1,
            c.remaining_reward_per_gem(duration_p1).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p2,
            c.remaining_reward_per_gem(duration_p2).unwrap()
        );
        assert_eq!(
            total_rewards - reward_p3,
            c.remaining_reward_per_gem(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_reward_per_gem(duration_too_long).unwrap());

        // test remaining_required_funding
        assert_eq!(
            100 * (total_rewards - reward_p1),
            c.remaining_required_funding(duration_p1).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p2),
            c.remaining_required_funding(duration_p2).unwrap()
        );
        assert_eq!(
            100 * (total_rewards - reward_p3),
            c.remaining_required_funding(duration_p3).unwrap()
        );
        assert_eq!(0, c.remaining_required_funding(duration_too_long).unwrap());
    }
}
