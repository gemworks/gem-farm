use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, *};

use crate::{number128::Number128, state::FixedRateSchedule};

#[proc_macros::assert_size(4)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum FarmerState {
    Unstaked,
    Staked,
    PendingCooldown,
}

#[proc_macros::assert_size(600)] // +4 to make it /8
#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farmer {
    pub farm: Pubkey,

    /// the identity of the farmer = their public key
    pub identity: Pubkey,

    /// vault storing all of the farmer's gems
    pub vault: Pubkey,

    pub state: FarmerState,

    /// total number of gems at the time when the vault is locked
    pub gems_staked: u64,

    /// total number of gems * rarity of each gem (1 if un-appraised)
    pub rarity_points_staked: u64,

    /// this will be updated when they decide to unstake taking into acc. config set at farm level
    pub min_staking_ends_ts: u64,

    /// this will be updated when they decide to unstake taking into acc. config set at farm level
    pub cooldown_ends_ts: u64,

    // ----------------- rewards
    pub reward_a: FarmerReward,

    pub reward_b: FarmerReward,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}

impl Farmer {
    pub fn begin_staking(
        &mut self,
        min_staking_period_sec: u64,
        now_ts: u64,
        gems_in_vault: u64,
        rarity_points_in_vault: u64,
    ) -> Result<(u64, u64)> {
        self.state = FarmerState::Staked;

        let previous_gems_staked = self.gems_staked;
        let previous_rarity_points_staked = self.rarity_points_staked;
        self.gems_staked = gems_in_vault;
        self.rarity_points_staked = rarity_points_in_vault;
        self.min_staking_ends_ts = now_ts.try_add(min_staking_period_sec)?;
        self.cooldown_ends_ts = 0; //zero it out in case it was set before

        Ok((previous_gems_staked, previous_rarity_points_staked))
    }

    pub fn end_staking_begin_cooldown(
        &mut self,
        now_ts: u64,
        cooldown_period_sec: u64,
    ) -> Result<(u64, u64)> {
        if !self.can_end_staking(now_ts) {
            return Err(error!(ErrorCode::MinStakingNotPassed));
        }

        self.state = FarmerState::PendingCooldown;

        let gems_unstaked = self.gems_staked;
        let rarity_points_unstaked = self.rarity_points_staked;
        self.gems_staked = 0; //no rewards will accrue during cooldown period
        self.rarity_points_staked = 0;
        self.cooldown_ends_ts = now_ts.try_add(cooldown_period_sec)?;

        // msg!(
        //     "{} gems now cooling down for {}",
        //     gems_unstaked,
        //     self.identity
        // );
        Ok((gems_unstaked, rarity_points_unstaked))
    }

    pub fn end_cooldown(&mut self, now_ts: u64) -> Result<()> {
        if !self.can_end_cooldown(now_ts) {
            return Err(error!(ErrorCode::CooldownNotPassed));
        }

        self.state = FarmerState::Unstaked;

        // zero everything out
        self.gems_staked = 0;
        self.rarity_points_staked = 0;
        self.min_staking_ends_ts = 0;
        self.cooldown_ends_ts = 0;

        // msg!(
        //     "gems now unstaked and available for withdrawal for {}",
        //     self.identity
        // );
        Ok(())
    }

    fn can_end_staking(&self, now_ts: u64) -> bool {
        now_ts >= self.min_staking_ends_ts
    }

    fn can_end_cooldown(&self, now_ts: u64) -> bool {
        now_ts >= self.cooldown_ends_ts
    }
}

// --------------------------------------- farmer reward

#[proc_macros::assert_size(216)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmerReward {
    /// total, not per rarity point. Never goes down (ie is cumulative)
    pub paid_out_reward: u64,

    /// total, not per rarity point. Never goes down (ie is cumulative)
    pub accrued_reward: u64,

    /// only one of these two (fixed and variable) will actually be used, per reward
    pub variable_rate: FarmerVariableRateReward,

    pub fixed_rate: FarmerFixedRateReward,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}

impl FarmerReward {
    pub fn outstanding_reward(&self) -> Result<u64> {
        self.accrued_reward.try_sub(self.paid_out_reward)
    }

    pub fn claim_reward(&mut self, pot_balance: u64) -> Result<u64> {
        let outstanding = self.outstanding_reward()?;
        let to_claim = std::cmp::min(outstanding, pot_balance);

        self.paid_out_reward.try_add_assign(to_claim)?;

        Ok(to_claim)
    }

    pub fn update_variable_reward(
        &mut self,
        newly_accrued_reward: u64,
        accrued_reward_per_rarity_point: Number128,
    ) -> Result<()> {
        self.accrued_reward.try_add_assign(newly_accrued_reward)?;

        self.variable_rate
            .last_recorded_accrued_reward_per_rarity_point = accrued_reward_per_rarity_point;

        Ok(())
    }

    pub fn update_fixed_reward(&mut self, now_ts: u64, newly_accrued_reward: u64) -> Result<()> {
        self.accrued_reward.try_add_assign(newly_accrued_reward)?;

        self.fixed_rate.last_updated_ts = self.fixed_rate.reward_upper_bound(now_ts)?;

        Ok(())
    }
}

// --------------------------------------- variable rate reward

#[proc_macros::assert_size(32)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmerVariableRateReward {
    /// used to keep track of how much of the variable reward has been updated for this farmer
    /// (read more in variable rate config)
    pub last_recorded_accrued_reward_per_rarity_point: Number128,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 16],
}

// --------------------------------------- fixed rate reward

#[proc_macros::assert_size(136)]
#[repr(C)]
#[derive(Debug, Copy, Clone, Default, AnchorSerialize, AnchorDeserialize)]
pub struct FarmerFixedRateReward {
    /// this is the time the farmer staked
    /// can be WAY BACK in the past, if we've rolled them multiple times
    pub begin_staking_ts: u64,

    /// this is the time the latest reward schedule they subscribed to begins
    /// (this + promised duration = end_schedule_ts)
    pub begin_schedule_ts: u64,

    /// always set to upper bound, not just now_ts (except funding)
    pub last_updated_ts: u64,

    /// when a farmer stakes with the fixed schedule, at the time of staking,
    /// we promise them a schedule for a certain duration (eg 1 token/rarity point/s for 100s)
    /// that then "reserves" a certain amount of funds so that they can't be promised to other farmers
    /// only if the farmer unstakes, will the reserve be void, and the funds become available again
    /// for either funding other farmers or withdrawing (when the reward is cancelled)
    pub promised_schedule: FixedRateSchedule,

    pub promised_duration: u64,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 16],
}

impl FarmerFixedRateReward {
    /// accrued to rolled stakers, whose begin_staking_ts < begin_schedule_ts
    pub fn loyal_staker_bonus_time(&self) -> Result<u64> {
        self.begin_schedule_ts.try_sub(self.begin_staking_ts)
    }

    pub fn end_schedule_ts(&self) -> Result<u64> {
        self.begin_schedule_ts.try_add(self.promised_duration)
    }

    pub fn is_staked(&self) -> bool {
        // these get zeroed out when farmer graduates
        self.begin_staking_ts > 0 && self.begin_schedule_ts > 0
    }

    pub fn is_time_to_graduate(&self, now_ts: u64) -> Result<bool> {
        Ok(now_ts >= self.end_schedule_ts()?)
    }

    pub fn reward_upper_bound(&self, now_ts: u64) -> Result<u64> {
        Ok(std::cmp::min(now_ts, self.end_schedule_ts()?))
    }

    pub fn time_from_staking_to_update(&self) -> Result<u64> {
        self.last_updated_ts.try_sub(self.begin_staking_ts)
    }

    /// (!) intentionally uses begin_staking_ts for both start_from and end_at
    /// in doing so we increase both start_from and end_at by exactly loyal_staker_bonus_time
    pub fn voided_reward(&self, rarity_points: u64) -> Result<u64> {
        let start_from = self.time_from_staking_to_update()?;
        let end_at = self.end_schedule_ts()?.try_sub(self.begin_staking_ts)?;

        self.promised_schedule
            .reward_amount(start_from, end_at, rarity_points)
    }

    /// (!) intentionally uses begin_staking_ts for both start_from and end_at
    /// in doing so we increase both start_from and end_at by exactly loyal_staker_bonus_time
    pub fn newly_accrued_reward(&self, now_ts: u64, rarity_points: u64) -> Result<u64> {
        let start_from = self.time_from_staking_to_update()?;
        let end_at = self
            .reward_upper_bound(now_ts)?
            .try_sub(self.begin_staking_ts)?;

        self.promised_schedule
            .reward_amount(start_from, end_at, rarity_points)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::TierConfig;

    impl FarmerFixedRateReward {
        pub fn new() -> Self {
            Self {
                begin_staking_ts: 100,
                begin_schedule_ts: 150,
                last_updated_ts: 155,
                promised_schedule: FixedRateSchedule {
                    base_rate: 3,
                    tier1: Some(TierConfig {
                        reward_rate: 5,
                        required_tenure: 55,
                    }),
                    tier2: Some(TierConfig {
                        reward_rate: 7,
                        required_tenure: 65,
                    }),
                    tier3: Some(TierConfig {
                        reward_rate: 11,
                        required_tenure: 75,
                    }),
                    denominator: 1,
                },
                promised_duration: 60,
                _reserved: [0; 16],
            }
        }
    }

    impl FarmerReward {
        pub fn new() -> Self {
            Self {
                paid_out_reward: 0,
                accrued_reward: 123,
                variable_rate: FarmerVariableRateReward {
                    last_recorded_accrued_reward_per_rarity_point: Number128::from(10u64),
                    _reserved: [0; 16],
                },
                fixed_rate: FarmerFixedRateReward::new(),
                _reserved: [0; 32],
            }
        }
    }

    #[test]
    fn test_farmer_fixed_rate_reward() {
        let r = FarmerFixedRateReward::new();

        assert_eq!(50, r.loyal_staker_bonus_time().unwrap());
        assert_eq!(210, r.end_schedule_ts().unwrap());
        assert_eq!(true, r.is_time_to_graduate(210).unwrap());
        assert_eq!(210, r.reward_upper_bound(250).unwrap());
        assert_eq!(55, r.time_from_staking_to_update().unwrap());

        // last update - staking = 55
        // ub - staking = 110
        // reward accrues for a total of 55s, with 50s bonus and 5s coming from current staking period
        assert_eq!((50 + 70 + 11 * 35) * 10, r.voided_reward(10).unwrap());

        // last update - staking = 55
        // now - staking = 85
        // reward accrues for a total of 30s, with 50s bonus and 5s coming from current staking period
        assert_eq!(
            (50 + 70 + 110) * 10,
            r.newly_accrued_reward(185, 10).unwrap()
        );
    }

    #[test]
    fn test_farmer_reward_update_variable() {
        let mut r = FarmerReward::new();
        assert_eq!(123, r.outstanding_reward().unwrap());

        r.update_variable_reward(10, Number128::from(50u64))
            .unwrap();
        assert_eq!(133, r.outstanding_reward().unwrap());
        assert_eq!(
            Number128::from(50u64),
            r.variable_rate
                .last_recorded_accrued_reward_per_rarity_point
        );
    }

    #[test]
    fn test_farmer_reward_update_fixed() {
        let mut r = FarmerReward::new();
        assert_eq!(123, r.outstanding_reward().unwrap());

        r.update_fixed_reward(9999, 10).unwrap();
        assert_eq!(133, r.outstanding_reward().unwrap());
        assert_eq!(210, r.fixed_rate.last_updated_ts);
    }

    #[test]
    fn test_farmer_reward_claim() {
        let mut r = FarmerReward::new();
        assert_eq!(123, r.outstanding_reward().unwrap());

        r.claim_reward(100).unwrap();
        assert_eq!(23, r.outstanding_reward().unwrap());
    }
}
