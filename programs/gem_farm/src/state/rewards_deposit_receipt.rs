use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct RewardsDepositReceipt {
    // which farm rewards are associated with
    pub farm: Pubkey,

    // where rewards got deposited
    pub rewards_pot: Pubkey,

    // rewards token mint
    pub rewards_mint: Pubkey,

    // initial amount deposited, before any distributions
    pub initial_amount: u64,

    // remaining amount to be distributed
    pub remaining_amount: u64,
}
