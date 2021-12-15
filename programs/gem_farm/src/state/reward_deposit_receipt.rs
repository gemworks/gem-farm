use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct RewardDepositReceipt {
    // which farm rewards are associated with
    pub farm: Pubkey,

    // where reward got deposited
    pub reward_pot: Pubkey,

    // reward token mint
    pub reward_mint: Pubkey,

    // total (aka cumulative) deposits in this mint
    pub total_deposit_amount: u64,

    pub first_deposit_ts: u64,

    pub last_deposit_ts: u64,

    pub deposit_count: u64,
}

impl RewardDepositReceipt {
    pub fn set_first_deposit_ts(&mut self, now_ts: u64) {
        // on actual first deposit the variable is initialized at 0
        if self.first_deposit_ts == 0 {
            self.first_deposit_ts = now_ts;
        }
    }
}
