use anchor_lang::prelude::*;
use gem_common::*;
use std::cell::RefCell;

#[repr(C)]
#[account]
#[derive(Debug)]
pub struct Farmer {
    pub farm: Pubkey,

    // the identity of the farmer = their public key
    pub identity: Pubkey,

    // vault storing all of the farmer's gems
    pub vault: Pubkey,

    // total number of gems at the time when the vault is locked
    pub gems_staked: u64,

    // --------------------------------------- rewards
    pub reward_a: FarmerRewardTracker,

    pub reward_b: FarmerRewardTracker,
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

        self.paid_out_reward.try_self_add(to_claim)?;

        Ok(to_claim)
    }
}
