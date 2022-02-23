use anchor_lang::prelude::*;
use gem_common::*;

use crate::{number128::Number128, state::*};

#[proc_macros::assert_size(16)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub struct VariableRateConfig {
    /// total amount of reward
    pub amount: u64,

    /// over which period it's active
    pub duration_sec: u64,
}

#[proc_macros::assert_size(72)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct VariableRateReward {
    /// in tokens/s, = calculated as total reward pot at initialization / reward duration
    pub reward_rate: Number128,

    /// set to upper bound, not just now_ts (except funding, when there is no upper bound)
    pub reward_last_updated_ts: u64,

    /// this is somewhat redundant with total_accrued_to_stakers in funds, but necessary
    /// think of it as a "flag in the ground" that gets moved forward as more rewards accrue to the pool
    /// when a farmer tries to figure out how much they're due from the pool, we:
    /// 1) compare their latest record of flag position, with actual flag position
    /// 2) multiply the difference by the amount they have staked
    /// 3) update their record of flag position, so that next time we don't count this distance again
    pub accrued_reward_per_rarity_point: Number128,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}

impl VariableRateReward {
    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        new_config: VariableRateConfig,
    ) -> Result<()> {
        let VariableRateConfig {
            amount,
            duration_sec,
        } = new_config;

        // if previous reward has been exhausted
        if now_ts > times.reward_end_ts {
            self.reward_rate = Number128::from(amount).try_div(Number128::from(duration_sec))?;
        // else if previous reward is still active (merge the two)
        } else {
            self.reward_rate = Number128::from(amount)
                .try_add(Number128::from(funds.pending_amount()?))?
                .try_div(Number128::from(duration_sec))?;
        }

        times.duration_sec = duration_sec;
        times.reward_end_ts = now_ts.try_add(duration_sec)?;

        funds.total_funded.try_add_assign(amount)?;

        self.reward_last_updated_ts = times.reward_upper_bound(now_ts);

        // msg!("recorded new funding of {}", amount);
        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64> {
        let refund_amount = funds.pending_amount()?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        times.end_reward(now_ts)?;

        self.reward_rate = Number128::ZERO;
        self.reward_last_updated_ts = times.reward_upper_bound(now_ts);

        // msg!("prepared a total refund of {}", refund_amount);
        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        times: &TimeTracker,
        funds: &mut FundsTracker,
        farm_rarity_points_staked: u64,
        farmer_rarity_points_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerReward>,
    ) -> Result<()> {
        let reward_upper_bound = times.reward_upper_bound(now_ts);

        // calc & update reward per rarity point
        let newly_accrued_reward_per_rarity_point = self
            .newly_accrued_reward_per_rarity_point(farm_rarity_points_staked, reward_upper_bound)?;

        self.accrued_reward_per_rarity_point
            .try_add_assign(newly_accrued_reward_per_rarity_point)?;

        // update overall reward
        funds.total_accrued_to_stakers.try_add_assign(
            newly_accrued_reward_per_rarity_point
                .try_mul(Number128::from(farm_rarity_points_staked))?
                .as_u64_ceil(0)?, //overestimate at farm level
        )?;

        // update farmer, if one was passed
        if let Some(farmer_reward) = farmer_reward {
            let newly_accrued_to_farmer = Number128::from(farmer_rarity_points_staked.unwrap())
                .try_mul(
                    self.accrued_reward_per_rarity_point.try_sub(
                        farmer_reward
                            .variable_rate
                            .last_recorded_accrued_reward_per_rarity_point,
                    )?,
                )?;

            farmer_reward.update_variable_reward(
                newly_accrued_to_farmer.as_u64(0)?, //underestimate at farmer level
                self.accrued_reward_per_rarity_point,
            )?;
        }

        self.reward_last_updated_ts = reward_upper_bound;

        // msg!("updated reward as of {}", self.reward_last_updated_ts);
        Ok(())
    }

    fn newly_accrued_reward_per_rarity_point(
        &self,
        farm_rarity_points_staked: u64,
        reward_upper_bound: u64,
    ) -> Result<Number128> {
        if farm_rarity_points_staked == 0 {
            msg!("no gems are staked at the farm, means no new rewards accrue");
            return Ok(Number128::ZERO);
        }

        let time_since_last_calc = reward_upper_bound.try_sub(self.reward_last_updated_ts)?;

        Number128::from(time_since_last_calc)
            .try_mul(self.reward_rate)?
            .try_div(Number128::from(farm_rarity_points_staked))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_accrued_reward_per_rarity_point() {
        let var_reward = VariableRateReward {
            reward_rate: Number128::from(10u64),
            reward_last_updated_ts: 200,
            accrued_reward_per_rarity_point: Number128::from(1234u64),
            _reserved: [0; 32],
        };

        let farm_points_staked = 25;
        let reward_upper_bound = 205;

        let newly_accrued = var_reward
            .newly_accrued_reward_per_rarity_point(farm_points_staked, reward_upper_bound)
            .unwrap();

        assert_eq!(newly_accrued, Number128::from(2u64));
    }

    #[test]
    fn test_fund_reward_fresh() {
        let mut times = TimeTracker {
            duration_sec: 10,
            reward_end_ts: 200,
            lock_end_ts: 0,
        };
        let mut funds = FundsTracker {
            total_funded: 100,
            total_refunded: 0,
            total_accrued_to_stakers: 0,
        };
        let new_config = VariableRateConfig {
            amount: 10,
            duration_sec: 80,
        };

        let now_ts = 201; //just after the previous reward ends at 200s

        let mut var_reward = VariableRateReward {
            reward_rate: Number128::from(10u64),
            reward_last_updated_ts: 0,
            accrued_reward_per_rarity_point: Number128::from(1234u64),
            _reserved: [0; 32],
        };

        var_reward
            .fund_reward(now_ts, &mut times, &mut funds, new_config)
            .unwrap();

        assert_eq!(
            var_reward.reward_rate,
            Number128::from_decimal(125u64, -3i32)
        );
        assert_eq!(var_reward.reward_last_updated_ts, 201);
        assert_eq!(
            var_reward.accrued_reward_per_rarity_point,
            Number128::from(1234u64)
        );

        assert_eq!(funds.total_funded, 110);

        assert_eq!(times.duration_sec, 80);
        assert_eq!(times.reward_end_ts, 281);
    }

    #[test]
    fn test_fund_reward_merged_1() {
        let mut times = TimeTracker {
            duration_sec: 10,
            reward_end_ts: 200,
            lock_end_ts: 0,
        };
        let mut funds = FundsTracker {
            total_funded: 100,
            total_refunded: 0,
            total_accrued_to_stakers: 0,
        };
        let new_config = VariableRateConfig {
            amount: 100,
            duration_sec: 400,
        };

        let now_ts = 199; //just before the previous reward, which triggers a merge

        let mut var_reward = VariableRateReward {
            reward_rate: Number128::from(10u64),
            reward_last_updated_ts: 0,
            accrued_reward_per_rarity_point: Number128::from(1234u64),
            _reserved: [0; 32],
        };

        var_reward
            .fund_reward(now_ts, &mut times, &mut funds, new_config)
            .unwrap();

        assert_eq!(var_reward.reward_rate, Number128::from_decimal(5u64, -1i32));
        assert_eq!(var_reward.reward_last_updated_ts, 199);
        assert_eq!(
            var_reward.accrued_reward_per_rarity_point,
            Number128::from(1234u64)
        );

        assert_eq!(funds.total_funded, 200);

        assert_eq!(times.duration_sec, 400);
        assert_eq!(times.reward_end_ts, 599);
    }

    /// this one has previous accrued / refunded amounts
    #[test]
    fn test_fund_reward_merged_2() {
        let mut times = TimeTracker {
            duration_sec: 10,
            reward_end_ts: 200,
            lock_end_ts: 0,
        };
        let mut funds = FundsTracker {
            total_funded: 100,
            total_refunded: 20,
            total_accrued_to_stakers: 30,
        };
        let new_config = VariableRateConfig {
            amount: 100,
            duration_sec: 400,
        };

        let now_ts = 199; //just before the previous reward, which triggers a merge

        let mut var_reward = VariableRateReward {
            reward_rate: Number128::from(10u64),
            reward_last_updated_ts: 0,
            accrued_reward_per_rarity_point: Number128::from(1234u64),
            _reserved: [0; 32],
        };

        var_reward
            .fund_reward(now_ts, &mut times, &mut funds, new_config)
            .unwrap();

        assert_eq!(
            var_reward.reward_rate,
            Number128::from_decimal(375u64, -3i32)
        );
        assert_eq!(var_reward.reward_last_updated_ts, 199);
        assert_eq!(
            var_reward.accrued_reward_per_rarity_point,
            Number128::from(1234u64)
        );

        assert_eq!(funds.total_funded, 200);

        assert_eq!(times.duration_sec, 400);
        assert_eq!(times.reward_end_ts, 599);
    }
}
