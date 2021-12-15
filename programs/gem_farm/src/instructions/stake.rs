use anchor_lang::prelude::*;

use gem_bank::program::GemBank;
use gem_bank::{self, cpi::accounts::SetVaultLock, state::Bank, state::Vault};
use gem_common::*;

use crate::rewards::update_accrued_rewards;
use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Stake<'info> {
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

impl<'info> Stake<'info> {
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

pub fn handler(ctx: Context<Stake>) -> ProgramResult {
    //todo any checks I might want to do here? eg whether staking paused

    // lock the vault so the user can't withdraw their gems
    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .set_lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        true,
    )?;

    // update accrued rewards BEFORE we increment the stake
    // todo does it actually make sense to update before?
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;

    update_accrued_rewards(farm, Some(farmer))?;

    // update farmer
    let vault = &ctx.accounts.vault;

    farmer.gems_staked = vault.gem_count;

    // update farm
    farm.active_farmer_count.try_self_add(1)?;
    farm.gems_staked.try_self_add(vault.gem_count)?;

    msg!("{} gems staked", farmer.gems_staked);
    Ok(())
}
