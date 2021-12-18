use anchor_lang::prelude::*;

use gem_common::{errors::ErrorCode, *};

use crate::state::*;

pub const LATEST_FARM_VERSION: u16 = 0;

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmConfig {
    // min time the NFT has to be staked
    pub min_staking_period_sec: u64,

    // time after user decides to unstake before they can actually withdraw
    pub cooldown_period_sec: u64,

    pub unstaking_fee_lamp: u64,
}

#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farm {
    pub version: u16,

    pub farm_manager: Pubkey,

    // used for collecting any fees earned by the farm
    pub farm_treasury: Pubkey,

    // signs off on any bank operations related to the farm
    pub farm_authority: Pubkey,

    pub farm_authority_seed: Pubkey,

    pub farm_authority_bump_seed: [u8; 1],

    // each farm controls a single bank
    pub bank: Pubkey,

    pub config: FarmConfig,

    // todo make sure all of the below count vars are incr'ed/decr'ed correctly
    // --------------------------------------- farmers
    // total count, including initialized but inactive farmers
    pub farmer_count: u64, //todo what's the use besides analytics?

    // active only
    pub staked_farmer_count: u64, //todo what's the use besides analytics??

    pub gems_staked: u64,

    // --------------------------------------- funders
    pub authorized_funder_count: u64,

    // --------------------------------------- rewards
    pub rewards_last_updated_ts: u64,

    pub reward_a: FarmRewardTracker,

    pub reward_b: FarmRewardTracker,
}

impl Farm {
    pub fn farm_seeds(&self) -> [&[u8]; 2] {
        [
            self.farm_authority_seed.as_ref(),
            &self.farm_authority_bump_seed,
        ]
    }

    pub fn match_reward_by_mint(
        &mut self,
        reward_mint: Pubkey,
    ) -> Result<&mut FarmRewardTracker, ProgramError> {
        let reward_a_mint = self.reward_a.reward_mint;
        let reward_b_mint = self.reward_b.reward_mint;

        match reward_mint {
            _ if reward_mint == reward_a_mint => Ok(&mut self.reward_a),
            _ if reward_mint == reward_b_mint => Ok(&mut self.reward_b),
            _ => Err(ErrorCode::UnknownRewardMint.into()),
        }
    }

    pub fn lock_funding_by_mint(&mut self, reward_mint: Pubkey) -> ProgramResult {
        let reward = self.match_reward_by_mint(reward_mint)?;
        reward.lock_reward()
    }

    pub fn fund_reward_by_mint(
        &mut self,
        now_ts: u64,
        new_amount: u64,
        new_duration_sec: u64,
        reward_mint: Pubkey,
        fixed_rate_config: Option<FixedRateConfig>,
    ) -> ProgramResult {
        let reward = self.match_reward_by_mint(reward_mint)?;

        reward.fund_reward_by_type(now_ts, new_amount, new_duration_sec, fixed_rate_config)?;

        self.rewards_last_updated_ts = now_ts;

        Ok(())
    }

    pub fn defund_reward_by_mint(
        &mut self,
        now_ts: u64,
        funder_withdrawable_amount: u64,
        desired_amount: u64,
        new_duration_sec: Option<u64>,
        reward_mint: Pubkey,
    ) -> Result<u64, ProgramError> {
        let reward = self.match_reward_by_mint(reward_mint)?;

        let to_defund = reward.defund_reward_by_type(
            now_ts,
            desired_amount,
            new_duration_sec,
            funder_withdrawable_amount,
        )?;

        self.rewards_last_updated_ts = now_ts;

        Ok(to_defund)
    }

    pub fn update_rewards_for_all_mints(
        &mut self,
        now_ts: u64,
        mut farmer: Option<&mut Account<Farmer>>,
    ) -> ProgramResult {
        // reward a
        let (farmer_gems_staked, farmer_begin_staking_ts, farmer_reward_a) = match farmer {
            Some(ref mut farmer) => (
                Some(farmer.gems_staked),
                Some(farmer.begin_staking_ts),
                Some(&mut farmer.reward_a),
            ),
            None => (None, None, None),
        };

        self.reward_a.update_accrued_reward_by_type(
            now_ts,
            self.rewards_last_updated_ts,
            self.gems_staked,
            farmer_gems_staked,
            farmer_begin_staking_ts,
            farmer_reward_a,
        )?;

        // reward b
        let farmer_reward_b = match farmer {
            Some(ref mut farmer) => Some(&mut farmer.reward_b),
            None => None,
        };

        self.reward_b.update_accrued_reward_by_type(
            now_ts,
            self.rewards_last_updated_ts,
            self.gems_staked,
            farmer_gems_staked,
            farmer_begin_staking_ts,
            farmer_reward_b,
        )?;

        self.rewards_last_updated_ts = now_ts;

        Ok(())
    }

    pub fn begin_staking(
        &mut self,
        now_ts: u64,
        gems_in_vault: u64,
        farmer: &mut Account<Farmer>,
    ) -> ProgramResult {
        // update farmer
        farmer.begin_staking(self.config.min_staking_period_sec, now_ts, gems_in_vault)?;

        // update farm
        self.staked_farmer_count.try_add_assign(1)?;
        self.gems_staked.try_add_assign(gems_in_vault)?;

        if self.reward_a.reward_type == RewardType::Fixed {
            self.reward_a
                .fixed_rate_tracker
                .gems_participating
                .try_add_assign(gems_in_vault)?;
        }

        if self.reward_b.reward_type == RewardType::Fixed {
            self.reward_b
                .fixed_rate_tracker
                .gems_participating
                .try_add_assign(gems_in_vault)?;
        }

        Ok(())
    }

    pub fn end_staking(&mut self, now_ts: u64, farmer: &mut Account<Farmer>) -> ProgramResult {
        match farmer.status {
            FarmerStatus::Unstaked => Ok(msg!("already unstaked!")),
            FarmerStatus::Staked => {
                // update farmer
                let gems_unstaked =
                    farmer.end_staking_begin_cooldown(now_ts, self.config.cooldown_period_sec)?;

                // update farm
                self.staked_farmer_count.try_sub_assign(1)?;
                self.gems_staked.try_sub_assign(gems_unstaked)?;

                // we will have updated the reward by now, so safe to mark whole
                if self.reward_a.reward_type == RewardType::Fixed {
                    farmer.reward_a.mark_whole();
                    self.reward_a
                        .fixed_rate_tracker
                        .gems_made_whole
                        .try_add_assign(gems_unstaked)?;
                }

                if self.reward_b.reward_type == RewardType::Fixed {
                    farmer.reward_b.mark_whole();
                    self.reward_b
                        .fixed_rate_tracker
                        .gems_made_whole
                        .try_add_assign(gems_unstaked)?;
                }

                Ok(())
            }
            FarmerStatus::PendingCooldown => farmer.end_cooldown(now_ts),
        }
    }

    pub fn stake_extra_gems(
        &mut self,
        now_ts: u64,
        gems_in_vault: u64,
        extra_gems: u64,
        farmer: &mut Account<Farmer>,
    ) -> ProgramResult {
        // update farmer
        farmer.stake_extra_gems(
            now_ts,
            gems_in_vault,
            extra_gems,
            self.config.min_staking_period_sec,
        )?;

        // update farm
        self.gems_staked.try_add_assign(extra_gems)
    }
}

// --------------------------------------- reward tracker

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum RewardType {
    Variable,
    Fixed,
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmRewardTracker {
    pub reward_mint: Pubkey,

    pub reward_pot: Pubkey,

    pub reward_type: RewardType,

    pub fixed_rate_tracker: FixedRateTracker,

    pub variable_rate_tracker: VariableRateTracker,

    pub reward_duration_sec: u64,

    pub reward_end_ts: u64,

    pub lock_end_ts: u64,
}

impl FarmRewardTracker {
    pub fn calc_reward_start_ts(&self) -> Result<u64, ProgramError> {
        self.reward_end_ts.try_sub(self.reward_duration_sec)
    }

    /// locking ensures that the promised reward cannot be withdrawn/changed by a malicious farm operator
    /// once locked, no funding / defunding of this account is possible until reward_end_ts
    /// (!) THIS OPERATION IS IRREVERSIBLE
    fn lock_reward(&mut self) -> ProgramResult {
        if self.reward_type == RewardType::Fixed {
            self.fixed_rate_tracker.assert_sufficient_funding()?;
        }

        self.lock_end_ts = self.reward_end_ts;

        Ok(())
    }

    fn is_locked(&self, now_ts: u64) -> bool {
        now_ts < self.lock_end_ts
    }

    fn fund_reward_by_type(
        &mut self,
        now_ts: u64,
        new_amount: u64,
        new_duration_sec: u64,
        fixed_rate_config: Option<FixedRateConfig>,
    ) -> ProgramResult {
        if self.is_locked(now_ts) {
            return Err(ErrorCode::RewardLocked.into());
        }

        match self.reward_type {
            RewardType::Variable => self.variable_rate_tracker.fund_reward(
                now_ts,
                self.reward_end_ts,
                new_amount,
                new_duration_sec,
            )?,
            RewardType::Fixed => self.fixed_rate_tracker.fund_reward(
                new_amount,
                new_duration_sec,
                fixed_rate_config.unwrap(), //guaranteed to be passed for fixed
            )?,
        }

        self.reward_duration_sec = new_duration_sec;
        self.reward_end_ts = now_ts.try_add(new_duration_sec)?;

        Ok(())
    }

    fn defund_reward_by_type(
        &mut self,
        now_ts: u64,
        desired_amount: u64,
        new_duration_sec: Option<u64>,
        funder_withdrawable_amount: u64,
    ) -> Result<u64, ProgramError> {
        if self.is_locked(now_ts) {
            return Err(ErrorCode::RewardLocked.into());
        }

        let to_defund = match self.reward_type {
            RewardType::Variable => self.variable_rate_tracker.defund_reward(
                now_ts,
                self.reward_end_ts,
                desired_amount,
                self.reward_duration_sec,
                new_duration_sec,
                funder_withdrawable_amount,
            )?,
            RewardType::Fixed => self
                .fixed_rate_tracker
                .defund_reward(desired_amount, funder_withdrawable_amount)?,
        };

        if let Some(new_duration_sec) = new_duration_sec {
            self.reward_duration_sec = new_duration_sec;
            self.reward_end_ts = now_ts.try_add(new_duration_sec)?;
        }

        Ok(to_defund)
    }

    fn update_accrued_reward_by_type(
        &mut self,
        now_ts: u64,
        rewards_last_updated_ts: u64,
        farm_gems_staked: u64,
        farmer_gems_staked: Option<u64>,
        farmer_begin_staking_ts: Option<u64>,
        farmer_reward: Option<&mut FarmerRewardTracker>,
    ) -> ProgramResult {
        let reward_upper_bound_ts = std::cmp::min(self.reward_end_ts, now_ts);

        if reward_upper_bound_ts <= rewards_last_updated_ts {
            msg!("this reward has ended and won't pay out anymore");
            return Ok(());
        }

        match self.reward_type {
            RewardType::Variable => self.variable_rate_tracker.update_accrued_reward(
                reward_upper_bound_ts,
                rewards_last_updated_ts,
                farm_gems_staked,
                farmer_gems_staked,
                farmer_reward,
            ),
            RewardType::Fixed => {
                // for fixed rewards we only update if Farmer has been passed
                if farmer_reward.is_none() {
                    return Ok(());
                }

                self.fixed_rate_tracker.update_accrued_reward(
                    now_ts,
                    self.reward_end_ts,
                    reward_upper_bound_ts,
                    farmer_gems_staked.unwrap(),      //assume passed too
                    farmer_begin_staking_ts.unwrap(), //assume passed too
                    farmer_reward.unwrap(),
                )
            }
        }
    }
}
