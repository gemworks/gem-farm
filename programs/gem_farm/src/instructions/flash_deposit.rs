use crate::instructions::FEE_WALLET;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gem_bank::instructions::calc_rarity_points;
use gem_bank::{
    self,
    cpi::accounts::{DepositGem, SetVaultLock},
    program::GemBank,
    state::{Bank, Vault},
};
use gem_common::*;
use std::str::FromStr;

use crate::state::*;

const FEE_LAMPORTS: u64 = 2_000_000; // 0.002 SOL per stake/unstake
const FD_FEE_LAMPORTS: u64 = 1_000_000; // half of that for FDs

#[derive(Accounts)]
#[instruction(bump_farmer: u8)]
pub struct FlashDeposit<'info> {
    // farm
    #[account(mut, has_one = farm_authority)]
    pub farm: Box<Account<'info, Farm>>,
    //skipping seeds verification to save compute budget, has_one check above should be enough
    /// CHECK:
    pub farm_authority: AccountInfo<'info>,

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
    pub bank: Box<Account<'info, Bank>>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    /// CHECK:
    pub vault_authority: AccountInfo<'info>,
    // trying to deserialize here leads to errors (doesn't exist yet)
    /// CHECK:
    #[account(mut)]
    pub gem_box: AccountInfo<'info>,
    // trying to deserialize here leads to errors (doesn't exist yet)
    /// CHECK:
    #[account(mut)]
    pub gem_deposit_receipt: AccountInfo<'info>,
    #[account(mut)]
    pub gem_source: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    /// CHECK:
    pub gem_rarity: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub gem_bank: Program<'info, GemBank>,
    /// CHECK:
    #[account(mut, address = Pubkey::from_str(FEE_WALLET).unwrap())]
    pub fee_acc: AccountInfo<'info>,
    //
    // remaining accounts could be passed, in this order:
    // - mint_whitelist_proof
    // - gem_metadata <- if we got to this point we can assume gem = NFT, not a fungible token
    // - creator_whitelist_proof
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
                gem_box: self.gem_box.clone(),
                gem_deposit_receipt: self.gem_deposit_receipt.clone(),
                gem_source: self.gem_source.to_account_info(),
                gem_mint: self.gem_mint.to_account_info(),
                gem_rarity: self.gem_rarity.clone(),
                token_program: self.token_program.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
        )
    }

    fn transfer_fee(&self, fee: u64) -> Result<()> {
        invoke(
            &system_instruction::transfer(self.identity.key, self.fee_acc.key, fee),
            &[
                self.identity.to_account_info(),
                self.fee_acc.clone(),
                self.system_program.to_account_info(),
            ],
        )
        .map_err(Into::into)
    }
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, FlashDeposit<'info>>,
    bump_vault_auth: u8,
    bump_rarity: u8,
    amount: u64,
) -> Result<()> {
    // flash deposit a gem into a locked vault
    gem_bank::cpi::set_vault_lock(
        ctx.accounts
            .set_lock_vault_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        false,
    )?;

    gem_bank::cpi::deposit_gem(
        ctx.accounts
            .deposit_gem_ctx()
            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        bump_vault_auth,
        bump_rarity,
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

    farm.update_rewards(now_ts, Some(farmer), true)?;

    ctx.accounts.vault.reload()?;

    // in case the command is used BEFORE farmer staked
    if farmer.gems_staked == 0 {
        farm.begin_staking(
            now_ts,
            ctx.accounts.vault.gem_count,
            ctx.accounts.vault.rarity_points,
            farmer,
        )?;
        //collect a fee for staking
        ctx.accounts.transfer_fee(FEE_LAMPORTS)?;
    } else {
        let extra_rarity = calc_rarity_points(&ctx.accounts.gem_rarity, amount)?;
        farm.stake_extra_gems(
            now_ts,
            ctx.accounts.vault.gem_count,
            ctx.accounts.vault.rarity_points,
            amount,
            extra_rarity,
            farmer,
        )?;
        //collect a fee for staking
        ctx.accounts.transfer_fee(FD_FEE_LAMPORTS)?;
    }

    // msg!("{} extra gems staked for {}", amount, farmer.key());
    Ok(())
}
