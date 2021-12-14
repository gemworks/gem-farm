use anchor_lang::prelude::*;
use gem_bank::program::GemBank;
use gem_bank::{self, cpi::accounts::SetVaultLock, state::Bank, state::Vault};
use gem_common::*;

use crate::state::*;
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Stake<'info> {
    #[account(mut, has_one = farm_authority)]
    pub farm: Account<'info, Farm>,
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

    // --------------------------------------- cpi
    #[account(constraint = bank.bank_manager == farm_authority.key())]
    pub bank: Account<'info, Bank>,
    #[account(mut, has_one = bank)]
    pub vault: Account<'info, Vault>,
    pub farm_authority: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> Stake<'info> {
    fn lock_vault_ctx(&self) -> CpiContext<'_, '_, '_, 'info, SetVaultLock<'info>> {
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
    //todo any checks I might want to do here?

    // lock the vault so the user can't withdraw their gems
    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        true, //setting vault lock to true
    )?;

    // record the beginning of staking on farmer
    let vault = &ctx.accounts.vault;
    let farmer = &mut ctx.accounts.farmer;
    farmer.gems_staked = vault.gem_count;
    // todo probably record something around the time they staked?

    // increment active farmer count on farm
    let farm = &mut ctx.accounts.farm;
    farm.active_farmer_count.try_self_add(1)?;

    msg!("{} gems staked", farmer.gems_staked);
    Ok(())
}
