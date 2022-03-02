use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, *};

use crate::state::*;

pub const LATEST_FARM_VERSION: u16 = 0;

#[proc_macros::assert_size(24)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmConfig {
    // min time the NFT has to be staked
    pub min_staking_period_sec: u64,

    // time after user decides to unstake before they can actually withdraw
    pub cooldown_period_sec: u64,

    pub unstaking_fee_lamp: u64,
}

/// refers to staked counts
#[proc_macros::assert_size(12)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct MaxCounts {
    pub max_farmers: u32,

    pub max_gems: u32,

    pub max_rarity_points: u32,
}

#[proc_macros::assert_size(1000)] // + 5 to make it /8
#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farm {
    pub version: u16,

    /// authorizes funders, whitelists mints/creators, sets farm config params
    /// can update itself to another Pubkey
    pub farm_manager: Pubkey,

    /// used for collecting any fees earned by the farm
    pub farm_treasury: Pubkey,

    /// signs off on treasury payouts and on any operations related to the bank
    /// (configured as bank manager)
    pub farm_authority: Pubkey,

    pub farm_authority_seed: Pubkey,

    pub farm_authority_bump_seed: [u8; 1],

    /// each farm controls a single bank. each farmer gets a vault in that bank
    pub bank: Pubkey,

    pub config: FarmConfig,

    // ----------------- counts
    /// total count, including initialized but inactive farmers
    pub farmer_count: u64,

    /// currently staked farmer count
    pub staked_farmer_count: u64,

    /// currently staked gem count
    pub gems_staked: u64,

    /// currently staked gem count, where each gem is multiplied by its rarity score (1 if absent)
    pub rarity_points_staked: u64,

    /// how many accounts can create funding schedules
    pub authorized_funder_count: u64,

    // ----------------- rewards
    pub reward_a: FarmReward,

    pub reward_b: FarmReward,

    // ----------------- extra
    pub max_counts: MaxCounts,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
    _reserved2: [u8; 16],
    _reserved3: [u8; 4],
}

impl Farm {
    fn assert_valid_max_counts(&self) -> Result<()> {
        self.assert_not_too_many_farmers()?;
        self.assert_not_too_many_gems()?;
        self.assert_not_too_many_rarity_points()?;
        Ok(())
    }

    fn assert_not_too_many_farmers(&self) -> Result<()> {
        if self.max_counts.max_farmers > 0 {
            require!(
                self.staked_farmer_count.try_cast()? <= self.max_counts.max_farmers,
                ErrorCode::TooManyFarmersStaked
            )
        }
        Ok(())
    }

    fn assert_not_too_many_gems(&self) -> Result<()> {
        if self.max_counts.max_gems > 0 {
            require!(
                self.gems_staked.try_cast()? <= self.max_counts.max_gems,
                ErrorCode::TooManyGemsStaked
            )
        }
        Ok(())
    }

    fn assert_not_too_many_rarity_points(&self) -> Result<()> {
        if self.max_counts.max_rarity_points > 0 {
            require!(
                self.rarity_points_staked.try_cast()? <= self.max_counts.max_rarity_points,
                ErrorCode::TooManyRarityPointsStaked
            )
        }
        Ok(())
    }

    pub fn farm_seeds(&self) -> [&[u8]; 2] {
        [
            self.farm_authority_seed.as_ref(),
            &self.farm_authority_bump_seed,
        ]
    }

    pub fn match_reward_by_mint(&mut self, reward_mint: Pubkey) -> Result<&mut FarmReward> {
        let reward_a_mint = self.reward_a.reward_mint;
        let reward_b_mint = self.reward_b.reward_mint;

        match reward_mint {
            _ if reward_mint == reward_a_mint => Ok(&mut self.reward_a),
            _ if reward_mint == reward_b_mint => Ok(&mut self.reward_b),
            _ => Err(error!(ErrorCode::UnknownRewardMint)),
        }
    }

    pub fn lock_reward_by_mint(&mut self, reward_mint: Pubkey) -> Result<()> {
        let reward = self.match_reward_by_mint(reward_mint)?;
        reward.lock_reward()
    }

    pub fn fund_reward_by_mint(
        &mut self,
        now_ts: u64,
        reward_mint: Pubkey,
        variable_rate_config: Option<VariableRateConfig>,
        fixed_rate_config: Option<FixedRateConfig>,
    ) -> Result<()> {
        let reward = self.match_reward_by_mint(reward_mint)?;
        reward.fund_reward_by_type(now_ts, variable_rate_config, fixed_rate_config)
    }

    pub fn cancel_reward_by_mint(&mut self, now_ts: u64, reward_mint: Pubkey) -> Result<u64> {
        let reward = self.match_reward_by_mint(reward_mint)?;
        reward.cancel_reward_by_type(now_ts)
    }

    pub fn update_rewards(
        &mut self,
        now_ts: u64,
        mut farmer: Option<&mut Account<Farmer>>,
        reenroll: bool, //relevant for fixed only
    ) -> Result<()> {
        // reward a
        let (farmer_points_staked, farmer_reward_a) = match farmer {
            Some(ref mut farmer) => (
                Some(farmer.rarity_points_staked),
                Some(&mut farmer.reward_a),
            ),
            None => (None, None),
        };

        self.reward_a.update_accrued_reward_by_type(
            now_ts,
            self.rarity_points_staked,
            farmer_points_staked,
            farmer_reward_a,
            reenroll,
        )?;

        // reward b
        let farmer_reward_b = match farmer {
            Some(ref mut farmer) => Some(&mut farmer.reward_b),
            None => None,
        };

        self.reward_b.update_accrued_reward_by_type(
            now_ts,
            self.rarity_points_staked,
            farmer_points_staked,
            farmer_reward_b,
            reenroll,
        )
    }

    pub fn begin_staking(
        &mut self,
        now_ts: u64,
        gems_in_vault: u64,
        rarity_points_in_vault: u64,
        farmer: &mut Account<Farmer>,
    ) -> Result<()> {
        // update farmer
        farmer.begin_staking(
            self.config.min_staking_period_sec,
            now_ts,
            gems_in_vault,
            rarity_points_in_vault,
        )?;

        // update farm
        self.staked_farmer_count.try_add_assign(1)?;
        self.gems_staked.try_add_assign(gems_in_vault)?;
        self.rarity_points_staked
            .try_add_assign(rarity_points_in_vault)?;

        self.assert_valid_max_counts()?;

        // fixed-rate only - we need to do some extra book-keeping
        if self.reward_a.reward_type == RewardType::Fixed {
            self.reward_a.fixed_rate.enroll_farmer(
                now_ts,
                &mut self.reward_a.times,
                &mut self.reward_a.funds,
                farmer.rarity_points_staked,
                &mut farmer.reward_a,
                None,
            )?;
        }

        if self.reward_b.reward_type == RewardType::Fixed {
            self.reward_b.fixed_rate.enroll_farmer(
                now_ts,
                &mut self.reward_b.times,
                &mut self.reward_b.funds,
                farmer.rarity_points_staked,
                &mut farmer.reward_b,
                None,
            )?;
        }

        Ok(())
    }

    pub fn end_staking(&mut self, now_ts: u64, farmer: &mut Account<Farmer>) -> Result<()> {
        match farmer.state {
            FarmerState::Unstaked => Ok(msg!("already unstaked!")),
            FarmerState::Staked => {
                // fixed-rate only - we need to do some extra book-keeping
                // (!) MUST COME BEFORE FARMER IS UPDATED - WE NEED CURRENT RARITY POINTS AMOUNT
                if self.reward_a.reward_type == RewardType::Fixed {
                    self.reward_a
                        .fixed_rate
                        .graduate_farmer(farmer.rarity_points_staked, &mut farmer.reward_a)?;
                }

                if self.reward_b.reward_type == RewardType::Fixed {
                    self.reward_b
                        .fixed_rate
                        .graduate_farmer(farmer.rarity_points_staked, &mut farmer.reward_b)?;
                }

                // update farmer
                let (gems_unstaked, rarity_points_unstaked) =
                    farmer.end_staking_begin_cooldown(now_ts, self.config.cooldown_period_sec)?;

                // update farm
                self.staked_farmer_count.try_sub_assign(1)?;
                self.rarity_points_staked
                    .try_sub_assign(rarity_points_unstaked)?;
                self.gems_staked.try_sub_assign(gems_unstaked)?;

                Ok(())
            }
            FarmerState::PendingCooldown => farmer.end_cooldown(now_ts),
        }
    }

    pub fn stake_extra_gems(
        &mut self,
        now_ts: u64,
        gems_in_vault: u64,
        rarity_points_in_vault: u64,
        extra_gems: u64,
        extra_rarity_points: u64,
        farmer: &mut Account<Farmer>,
    ) -> Result<()> {
        // update farmer
        let (_previous_gems, previous_rarity_points) = farmer.begin_staking(
            self.config.min_staking_period_sec,
            now_ts,
            gems_in_vault,
            rarity_points_in_vault,
        )?;

        // update farm
        self.gems_staked.try_add_assign(extra_gems)?;
        self.rarity_points_staked
            .try_add_assign(extra_rarity_points)?;

        self.assert_valid_max_counts()?;

        // fixed-rate only - we need to do some extra book-keeping
        if self.reward_a.reward_type == RewardType::Fixed {
            // graduate with PREVIOUS rarity points count
            let original_begin_staking_ts = self
                .reward_a
                .fixed_rate
                .graduate_farmer(previous_rarity_points, &mut farmer.reward_a)?;

            // re-enroll with NEW rarity points count
            self.reward_a.fixed_rate.enroll_farmer(
                now_ts,
                &mut self.reward_a.times,
                &mut self.reward_a.funds,
                farmer.rarity_points_staked,
                &mut farmer.reward_a,
                Some(original_begin_staking_ts),
            )?;
        }

        if self.reward_b.reward_type == RewardType::Fixed {
            // graduate with PREVIOUS rarity points count
            let original_begin_staking_ts = self
                .reward_b
                .fixed_rate
                .graduate_farmer(previous_rarity_points, &mut farmer.reward_b)?;

            // re-enroll with NEW rarity points count
            self.reward_b.fixed_rate.enroll_farmer(
                now_ts,
                &mut self.reward_b.times,
                &mut self.reward_b.funds,
                farmer.rarity_points_staked,
                &mut farmer.reward_b,
                Some(original_begin_staking_ts),
            )?;
        }

        Ok(())
    }
}

// --------------------------------------- farm reward

#[proc_macros::assert_size(4)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum RewardType {
    Variable,
    Fixed,
}

/// these numbers should only ever go up - ie they are cummulative
#[proc_macros::assert_size(24)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FundsTracker {
    pub total_funded: u64,

    pub total_refunded: u64,

    pub total_accrued_to_stakers: u64,
}

impl FundsTracker {
    pub fn pending_amount(&self) -> Result<u64> {
        self.total_funded
            .try_sub(self.total_refunded)?
            .try_sub(self.total_accrued_to_stakers)
    }
}

#[proc_macros::assert_size(24)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TimeTracker {
    /// total duration for which the reward has been funded
    /// updated with each new funding round
    pub duration_sec: u64,

    pub reward_end_ts: u64,

    /// this will be set = to reward_end_ts if farm manager decides to lock up their reward
    /// gives stakers the certainty it won't be withdrawn
    pub lock_end_ts: u64,
}

impl TimeTracker {
    pub fn reward_begin_ts(&self) -> Result<u64> {
        self.reward_end_ts.try_sub(self.duration_sec)
    }

    pub fn remaining_duration(&self, now_ts: u64) -> Result<u64> {
        if now_ts >= self.reward_end_ts {
            return Ok(0);
        }

        self.reward_end_ts.try_sub(now_ts)
    }

    pub fn passed_duration(&self, now_ts: u64) -> Result<u64> {
        self.duration_sec.try_sub(self.remaining_duration(now_ts)?)
    }

    pub fn end_reward(&mut self, now_ts: u64) -> Result<()> {
        self.duration_sec
            .try_sub_assign(self.remaining_duration(now_ts)?)?;
        self.reward_end_ts = std::cmp::min(now_ts, self.reward_end_ts);

        Ok(())
    }

    /// returns whichever comes first - now or the end of the reward
    pub fn reward_upper_bound(&self, now_ts: u64) -> u64 {
        std::cmp::min(self.reward_end_ts, now_ts)
    }

    /// returns whichever comes last - beginning of the reward, or beginning of farmer's staking
    pub fn reward_lower_bound(&self, farmer_begin_staking_ts: u64) -> Result<u64> {
        Ok(std::cmp::max(
            self.reward_begin_ts()?,
            farmer_begin_staking_ts,
        ))
    }
}

#[proc_macros::assert_size(352)] // +4  to make it /8
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmReward {
    /// in v0 the next 3 fields (mint, pot type) are set ONLY once, at farm init
    ///   and can't ever be changed for security reasons
    ///   potentially in v1++ might find a way around it, but for now just use a new farm
    pub reward_mint: Pubkey,

    /// where the reward is stored
    pub reward_pot: Pubkey,

    pub reward_type: RewardType,

    /// only one of these two (fixed and variable) will actually be used, per reward
    pub fixed_rate: FixedRateReward,

    pub variable_rate: VariableRateReward,

    pub funds: FundsTracker,

    pub times: TimeTracker,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}

impl FarmReward {
    /// (!) THIS OPERATION IS IRREVERSIBLE
    /// locking ensures the committed reward cannot be withdrawn/changed by a malicious farm operator
    /// once locked, any funding / cancellation ixs become non executable until reward_ned_ts is reached
    fn lock_reward(&mut self) -> Result<()> {
        self.times.lock_end_ts = self.times.reward_end_ts;

        // msg!("locked reward up to {}", self.times.reward_end_ts);
        Ok(())
    }

    fn is_locked(&self, now_ts: u64) -> bool {
        now_ts < self.times.lock_end_ts
    }

    fn fund_reward_by_type(
        &mut self,
        now_ts: u64,
        variable_rate_config: Option<VariableRateConfig>,
        fixed_rate_config: Option<FixedRateConfig>,
    ) -> Result<()> {
        if self.is_locked(now_ts) {
            return Err(error!(ErrorCode::RewardLocked));
        }

        match self.reward_type {
            RewardType::Variable => self.variable_rate.fund_reward(
                now_ts,
                &mut self.times,
                &mut self.funds,
                variable_rate_config.unwrap(),
            ),
            RewardType::Fixed => self.fixed_rate.fund_reward(
                now_ts,
                &mut self.times,
                &mut self.funds,
                fixed_rate_config.unwrap(),
            ),
        }
    }

    fn cancel_reward_by_type(&mut self, now_ts: u64) -> Result<u64> {
        if self.is_locked(now_ts) {
            return Err(error!(ErrorCode::RewardLocked));
        }

        match self.reward_type {
            RewardType::Variable => {
                self.variable_rate
                    .cancel_reward(now_ts, &mut self.times, &mut self.funds)
            }
            RewardType::Fixed => {
                self.fixed_rate
                    .cancel_reward(now_ts, &mut self.times, &mut self.funds)
            }
        }
    }

    fn update_accrued_reward_by_type(
        &mut self,
        now_ts: u64,
        farm_rarity_points_staked: u64,
        farmer_rarity_points_staked: Option<u64>,
        farmer_reward: Option<&mut FarmerReward>,
        reenroll: bool,
    ) -> Result<()> {
        match self.reward_type {
            RewardType::Variable => self.variable_rate.update_accrued_reward(
                now_ts,
                &self.times,
                &mut self.funds,
                farm_rarity_points_staked,
                farmer_rarity_points_staked,
                farmer_reward,
            ),
            RewardType::Fixed => {
                // for fixed rewards we only update if Farmer has been passed
                if farmer_reward.is_none() {
                    return Ok(());
                }

                self.fixed_rate.update_accrued_reward(
                    now_ts,
                    &mut self.times,
                    &mut self.funds,
                    farmer_rarity_points_staked.unwrap(),
                    farmer_reward.unwrap(),
                    reenroll,
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_tracker() {
        let times = TimeTracker {
            duration_sec: 100,
            reward_end_ts: 200,
            lock_end_ts: 0,
        };

        assert_eq!(70, times.remaining_duration(130).unwrap());
        assert_eq!(0, times.remaining_duration(9999).unwrap());
        assert_eq!(30, times.passed_duration(130).unwrap());
        assert_eq!(199, times.reward_upper_bound(199));
        assert_eq!(200, times.reward_upper_bound(201));
        assert_eq!(100, times.reward_begin_ts().unwrap());
        assert_eq!(110, times.reward_lower_bound(110).unwrap());
    }

    #[test]
    fn test_time_tracker_end_reward() {
        let mut times = TimeTracker {
            duration_sec: 80,
            reward_end_ts: 200,
            lock_end_ts: 0,
        };

        times.end_reward(140).unwrap();
        assert_eq!(times.duration_sec, 20);
        assert_eq!(times.reward_end_ts, 140);

        // repeated calls with later TS won't have an effect
        times.end_reward(150).unwrap();
        assert_eq!(times.duration_sec, 20);
        assert_eq!(times.reward_end_ts, 140);
    }

    #[test]
    fn test_funds_tracker() {
        let funds = FundsTracker {
            total_funded: 100,
            total_refunded: 50,
            total_accrued_to_stakers: 30,
        };

        assert_eq!(20, funds.pending_amount().unwrap());
    }
}
