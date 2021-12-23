use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gem_bank::{
    self,
    cpi::accounts::{DepositGem, SetVaultLock},
    program::GemBank,
    state::{Bank, GemDepositReceipt, Vault},
};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_farmer: u8)]
pub struct FlashDeposit<'info> {
    // farm
    #[account(mut, has_one = farm_authority)]
    pub farm: Box<Account<'info, Farm>>,
    pub farm_authority: AccountInfo<'info>,

    // farmer
    #[account(mut, has_one = farm, has_one = identity,
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
    pub bank: Box<Account<'info, Bank>>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    pub vault_authority: AccountInfo<'info>,
    #[account(mut)]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(mut)]
    pub gem_source: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> FlashDeposit<'info> {
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

    fn deposit_gem_ctx(&self) -> CpiContext<'_, '_, '_, 'info, DepositGem<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            DepositGem {
                bank: self.bank.to_account_info(),
                vault: self.vault.to_account_info(),
                owner: self.identity.to_account_info(),
                authority: self.vault_authority.clone(),
                gem_box: self.gem_box.to_account_info(),
                gem_deposit_receipt: self.gem_deposit_receipt.to_account_info(),
                gem_source: self.gem_source.to_account_info(),
                gem_mint: self.gem_mint.to_account_info(),
                token_program: self.token_program.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
                //     todo creator proofs and shit
            },
        )
    }
}

// todo I'll defo want a good sec review on this one
pub fn handler(
    ctx: Context<FlashDeposit>,
    bump_gem_box: u8,
    bump_gdr: u8,
    amount: u64,
) -> ProgramResult {
    //todo any checks I might want to do here?
    //  eg probably need a "live/paused" feature
    //  eg is it okay to start staking when both reward pots are empty?

    // flash deposit a gem into a locked vault
    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .set_lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        false,
    )?;

    gem_bank::cpi::deposit_gem(
        ctx.accounts.deposit_gem_ctx(),
        bump_gem_box,
        bump_gdr,
        amount,
    )?;

    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .set_lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        true,
    )?;

    // update accrued rewards BEFORE we increment the stake
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;
    let now_ts = now_ts()?;

    farm.update_rewards(now_ts, Some(farmer))?;

    // stake extra gems
    ctx.accounts.vault.reload()?;
    farm.stake_extra_gems(now_ts, ctx.accounts.vault.gem_count, amount, farmer)?;

    msg!("{} extra gems staked for {}", amount, farmer.key());
    Ok(())
}
