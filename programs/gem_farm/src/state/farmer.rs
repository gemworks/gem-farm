use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, *};

use crate::state::Farm;

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize, PartialEq)]
pub enum FarmerStatus {
    Unstaked,
    Staked,
    PendingCooldown,
}

#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farmer {
    pub farm: Pubkey,

    // the identity of the farmer = their public key
    pub identity: Pubkey,

    // vault storing all of the farmer's gems
    pub vault: Pubkey,

    pub status: FarmerStatus,

    // total number of gems at the time when the vault is locked
    pub gems_staked: u64,

    pub begin_staking_ts: u64,

    pub min_staking_ends_ts: u64,

    pub cooldown_ends_ts: u64,

    // --------------------------------------- rewards
    pub reward_a: FarmerRewardTracker,

    pub reward_b: FarmerRewardTracker,
}

impl Farmer {
    pub fn stake_extra_gems(
        &mut self,
        farm: &mut Account<Farm>,
        now_ts: u64,
        gems_in_vault: u64,
        extra_gems: u64,
    ) -> ProgramResult {
        msg!("{}, {}, {}", self.gems_staked, extra_gems, gems_in_vault);
        if self.gems_staked.try_add(extra_gems)? != gems_in_vault {
            return Err(ErrorCode::AmountMismatch.into());
        }

        // farmer
        self.status = FarmerStatus::Staked;
        self.gems_staked = gems_in_vault;

        // (!) IMPORTANT - we're resetting the min staking here
        self.begin_staking_ts = now_ts;
        self.min_staking_ends_ts = now_ts.try_add(farm.config.min_staking_period_sec)?;
        self.cooldown_ends_ts = 0; //zero it out in case it was set before

        // farm
        farm.gems_staked.try_add_assign(extra_gems)
    }

    pub fn begin_staking(
        &mut self,
        farm: &mut Account<Farm>,
        now_ts: u64,
        gems_in_vault: u64,
    ) -> ProgramResult {
        // farmer
        self.status = FarmerStatus::Staked;
        self.gems_staked = gems_in_vault;
        self.begin_staking_ts = now_ts;
        self.min_staking_ends_ts = now_ts.try_add(farm.config.min_staking_period_sec)?;
        self.cooldown_ends_ts = 0; //zero it out in case it was set before

        // farm
        farm.staked_farmer_count.try_add_assign(1)?;
        farm.gems_staked.try_add_assign(gems_in_vault)
    }

    pub fn end_staking_begin_cooldown(&mut self, farm: &mut Account<Farm>) -> ProgramResult {
        if !self.can_end_staking()? {
            return Err(ErrorCode::MinStakingNotPassed.into());
        }

        // farmer
        self.status = FarmerStatus::PendingCooldown;
        let farmer_had_staked = self.gems_staked;
        self.gems_staked = 0; //no rewards will accrue during cooldown period
        self.cooldown_ends_ts = now_ts()?.try_add(farm.config.cooldown_period_sec)?;

        // farm
        farm.staked_farmer_count.try_sub_assign(1)?;
        farm.gems_staked.try_sub_assign(farmer_had_staked)?;

        msg!(
            "{} gems now cooling down for {}",
            farmer_had_staked,
            self.identity
        );
        Ok(())
    }

    pub fn end_cooldown(&mut self) -> ProgramResult {
        if !self.can_end_cooldown()? {
            return Err(ErrorCode::CooldownNotPassed.into());
        }

        self.status = FarmerStatus::Unstaked;
        // zero everything out
        self.gems_staked = 0;
        self.begin_staking_ts = 0;
        self.min_staking_ends_ts = 0;
        self.cooldown_ends_ts = 0;

        msg!(
            "gems now unstaked and available for withdrawal for {}",
            self.identity
        );
        Ok(())
    }

    pub fn can_end_staking(&self) -> Result<bool, ProgramError> {
        Ok(now_ts()? >= self.min_staking_ends_ts)
    }

    pub fn can_end_cooldown(&self) -> Result<bool, ProgramError> {
        Ok(now_ts()? >= self.cooldown_ends_ts)
    }

    pub fn try_unstake(&mut self, farm: &mut Account<Farm>) -> ProgramResult {
        match self.status {
            FarmerStatus::Unstaked => Ok(msg!("already unstaked!")),
            FarmerStatus::Staked => self.end_staking_begin_cooldown(farm),
            FarmerStatus::PendingCooldown => self.end_cooldown(),
        }
    }
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmerRewardTracker {
    // (!) record absolute instead of per gem - see docs for why todo
    pub paid_out_reward: u64,

    pub accrued_reward: u64,
}

impl FarmerRewardTracker {
    pub fn outstanding_reward(&self) -> Result<u64, ProgramError> {
        self.accrued_reward.try_sub(self.paid_out_reward)
    }

    pub fn claim_reward(&mut self, pot_balance: u64) -> Result<u64, ProgramError> {
        let outstanding = self.outstanding_reward()?;
        let to_claim = std::cmp::min(outstanding, pot_balance);

        self.paid_out_reward.try_add_assign(to_claim)?;

        Ok(to_claim)
    }
}
