use anchor_lang::prelude::*;
use gem_common::*;

/// one per funder x mint. Used to cap max defunding amount
#[repr(C)]
#[account]
#[derive(Debug)]
pub struct FundingReceipt {
    pub funder: Pubkey,

    pub reward_mint: Pubkey,

    // --------------------------------------- deposits
    pub total_deposited_amount: u64,

    pub deposit_count: u64,

    pub last_deposit_ts: u64,

    // --------------------------------------- withdrawals
    pub total_withdrawn_amount: u64,

    pub withdrawal_count: u64,

    pub last_withdrawal_ts: u64,
}

impl FundingReceipt {
    pub fn funder_withdrawable_amount(&self) -> Result<u64, ProgramError> {
        self.total_deposited_amount
            .try_sub(self.total_withdrawn_amount)
    }
}
