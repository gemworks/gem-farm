use anchor_lang::prelude::*;

use gem_bank::program::GemBank;
use gem_bank::{self, cpi::accounts::SetVaultLock, state::Bank, state::Vault};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Unstake<'info> {
    // farm
    #[account(mut, has_one = farm_authority)]
    pub farm: Account<'info, Farm>,

    // farmer
    #[account(mut, has_one = farm, has_one = identity,
        seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump)]
    pub farmer: Account<'info, Farmer>,
    #[account(mut)]
    pub identity: Signer<'info>,

    // cpi
    #[account(constraint = bank.bank_manager == farm_authority.key())]
    pub bank: Account<'info, Bank>,
    #[account(mut, has_one = bank)]
    pub vault: Account<'info, Vault>,
    pub farm_authority: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> Unstake<'info> {
    fn set_lock_vault_ctx(&self) -> CpiContext<'_, '_, '_, 'info, SetVaultLock<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            SetVaultLock {
                bank: self.bank.to_account_info(),
                vault: self.vault.to_account_info(),
                bank_manager: self.farm_authority.clone(),
            },
        )
    }
}

pub fn handler(ctx: Context<Unstake>) -> ProgramResult {
    //todo any checks I might want to do here?
    //  eg probably need a "live/paused" feature
    //  eg is it okay to start staking when both reward pots are empty?

    // unlock the vault so the user can withdraw their gems
    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .set_lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        false,
    )?;

    // update accrued rewards BEFORE we decrement the stake
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;

    farm.update_rewards_for_all_mints(now_ts()?, Some(farmer))?;

    // update farmer
    farmer.gems_staked = 0;

    // update farm
    farm.active_farmer_count.try_self_sub(1)?;
    farm.gems_staked
        .try_self_sub(ctx.accounts.vault.gem_count)?;

    msg!("{} gems unstaked by {}", farmer.gems_staked, farmer.key());
    Ok(())
}
