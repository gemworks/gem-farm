use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, *};

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
        now_ts: u64,
        gems_in_vault: u64,
        extra_gems: u64,
        min_staking_period_sec: u64,
    ) -> ProgramResult {
        if self.gems_staked.try_add(extra_gems)? != gems_in_vault {
            return Err(ErrorCode::AmountMismatch.into());
        }

        self.status = FarmerStatus::Staked;
        self.gems_staked = gems_in_vault;

        // (!) IMPORTANT - we're resetting the min staking here
        self.begin_staking_ts = now_ts;
        self.min_staking_ends_ts = now_ts.try_add(min_staking_period_sec)?;
        self.cooldown_ends_ts = 0; //zero it out in case it was set before

        Ok(())
    }

    pub fn begin_staking(
        &mut self,
        min_staking_period_sec: u64,
        now_ts: u64,
        gems_in_vault: u64,
    ) -> ProgramResult {
        self.status = FarmerStatus::Staked;
        self.gems_staked = gems_in_vault;
        self.begin_staking_ts = now_ts;
        self.min_staking_ends_ts = now_ts.try_add(min_staking_period_sec)?;
        self.cooldown_ends_ts = 0; //zero it out in case it was set before

        Ok(())
    }

    pub fn end_staking_begin_cooldown(
        &mut self,
        now_ts: u64,
        cooldown_period_sec: u64,
    ) -> Result<u64, ProgramError> {
        if !self.can_end_staking(now_ts) {
            return Err(ErrorCode::MinStakingNotPassed.into());
        }

        self.status = FarmerStatus::PendingCooldown;
        let gems_unstaked = self.gems_staked;
        self.gems_staked = 0; //no rewards will accrue during cooldown period
        self.cooldown_ends_ts = now_ts.try_add(cooldown_period_sec)?;

        msg!(
            "{} gems now cooling down for {}",
            gems_unstaked,
            self.identity
        );
        Ok(gems_unstaked)
    }

    pub fn end_cooldown(&mut self, now_ts: u64) -> ProgramResult {
        if !self.can_end_cooldown(now_ts) {
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

    fn can_end_staking(&self, now_ts: u64) -> bool {
        now_ts >= self.min_staking_ends_ts
    }

    fn can_end_cooldown(&self, now_ts: u64) -> bool {
        now_ts >= self.cooldown_ends_ts
    }
}

#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FarmerRewardTracker {
    // total, not per gem
    pub paid_out_reward: u64,

    // total, not per gem
    pub accrued_reward: u64,

    // only used in fixed rate staking to indicate we've stashed away enough reward to cover this farmer
    pub reward_whole: bool,
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

    pub fn is_whole(&self) -> bool {
        self.reward_whole
    }

    pub fn mark_whole(&mut self) {
        self.reward_whole = true
    }
}
