use anchor_lang::prelude::*;
use gem_common::*;

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
    // (!) record absolute instead of per gem - see docs for why todo
    pub paid_out_rewards_total: u64,

    pub accrued_rewards_total: u64,
}

impl Farmer {
    pub fn available_to_claim(&self) -> Result<u64, ProgramError> {
        self.accrued_rewards_total
            .try_sub(self.paid_out_rewards_total)
    }

    pub fn claim_rewards(&mut self) -> Result<u64, ProgramError> {
        let to_claim = self.available_to_claim()?;
        self.paid_out_rewards_total = self.accrued_rewards_total;

        Ok(to_claim)
    }
}
