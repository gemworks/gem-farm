use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, system_instruction},
};
use gem_bank::{
    self,
    cpi::accounts::SetVaultLock,
    program::GemBank,
    state::{Bank, Vault},
};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_treasury: u8, bump_farmer: u8)]
pub struct Unstake<'info> {
    // farm
    #[account(mut, has_one = farm_authority, has_one = farm_treasury, has_one = bank)]
    pub farm: Box<Account<'info, Farm>>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(mut, seeds = [b"treasury".as_ref(), farm.key().as_ref()], bump = bump_treasury)]
    pub farm_treasury: AccountInfo<'info>,

    // farmer
    #[account(mut, has_one = farm, has_one = identity, has_one = vault,
        seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump_farmer)]
    pub farmer: Box<Account<'info, Farmer>>,
    #[account(mut)]
    pub identity: Signer<'info>,

    // cpi
    #[account(constraint = bank.bank_manager == farm_authority.key())]
    pub bank: Box<Account<'info, Bank>>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    pub gem_bank: Program<'info, GemBank>,

    //misc
    pub system_program: Program<'info, System>,
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

    fn pay_treasury(&self, lamports: u64) -> Result<()> {
        invoke(
            &system_instruction::transfer(self.identity.key, self.farm_treasury.key, lamports),
            &[
                self.identity.to_account_info(),
                self.farm_treasury.clone(),
                self.system_program.to_account_info(),
            ],
        )
        .map_err(Into::into)
    }
}

pub fn handler(ctx: Context<Unstake>, skip_rewards: bool) -> Result<()> {
    // collect any unstaking fee
    let farm = &ctx.accounts.farm;

    if ctx.accounts.farmer.state == FarmerState::Staked && farm.config.unstaking_fee_lamp > 0 {
        ctx.accounts.pay_treasury(farm.config.unstaking_fee_lamp)?
    }

    // update accrued rewards BEFORE we decrement the stake
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;
    let now_ts = now_ts()?;

    // skipping rewards is an EMERGENCY measure in case farmer's rewards are overflowing
    // at least this lets them get their assets out
    if !skip_rewards {
        farm.update_rewards(now_ts, Some(farmer), false)?;
    }

    // end staking (will cycle through state on repeated calls)
    farm.end_staking(now_ts, farmer)?;

    if farmer.state == FarmerState::Unstaked {
        // unlock the vault so the user can withdraw their gems
        gem_bank::cpi::set_vault_lock(
            ctx.accounts
                .set_lock_vault_ctx()
                .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
            false,
        )?;
    }

    Ok(())
}
