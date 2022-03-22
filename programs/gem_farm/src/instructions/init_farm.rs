use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use anchor_spl::token::{Mint, Token, TokenAccount};
use gem_bank::{self, cpi::accounts::InitBank, program::GemBank};
use std::str::FromStr;

use crate::state::*;

pub const FEE_WALLET: &str = "2xhBxVVuXkdq2MRKerE9mr2s1szfHSedy21MVqf8gPoM"; //5th
const FEE_LAMPORTS: u64 = 2_500_000_000; // 2.5 SOL per farm

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_treasury: u8)]
pub struct InitFarm<'info> {
    // farm
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Farm>())]
    pub farm: Box<Account<'info, Farm>>,
    pub farm_manager: Signer<'info>,
    /// CHECK:
    #[account(mut, seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(seeds = [b"treasury".as_ref(), farm.key().as_ref()], bump = bump_treasury)]
    pub farm_treasury: AccountInfo<'info>,

    // reward a
    #[account(init, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_a_mint.key().as_ref(),
        ],
        bump,
        token::mint = reward_a_mint,
        token::authority = farm_authority,
        payer = payer)]
    pub reward_a_pot: Box<Account<'info, TokenAccount>>,
    pub reward_a_mint: Box<Account<'info, Mint>>,

    // reward b
    #[account(init, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_b_mint.key().as_ref(),
        ],
        bump,
        token::mint = reward_b_mint,
        token::authority = farm_authority,
        payer = payer)]
    pub reward_b_pot: Box<Account<'info, TokenAccount>>,
    pub reward_b_mint: Box<Account<'info, Mint>>,

    // cpi
    #[account(mut)]
    pub bank: Signer<'info>,
    pub gem_bank: Program<'info, GemBank>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK:
    #[account(mut, address = Pubkey::from_str(FEE_WALLET).unwrap())]
    pub fee_acc: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitFarm<'info> {
    fn init_bank_ctx(&self) -> CpiContext<'_, '_, '_, 'info, InitBank<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            InitBank {
                bank: self.bank.to_account_info(),
                // using farm_authority, NOT farm_manager, coz on certain ixs (eg lock/unclock)
                // we need manager's sig, but we don't have farm manager's KP.
                // unfortunately this means we have to write a CPI ix for farm for each ix for bank
                bank_manager: self.farm_authority.clone(),
                payer: self.payer.to_account_info(),
                system_program: self.system_program.to_account_info(),
            },
        )
    }

    fn transfer_fee(&self) -> Result<()> {
        invoke(
            &system_instruction::transfer(self.payer.key, self.fee_acc.key, FEE_LAMPORTS),
            &[
                self.payer.to_account_info(),
                self.fee_acc.clone(),
                self.system_program.to_account_info(),
            ],
        )
        .map_err(Into::into)
    }
}

pub fn handler(
    ctx: Context<InitFarm>,
    bump_auth: u8,
    reward_type_a: RewardType,
    reward_type_b: RewardType,
    farm_config: FarmConfig,
    max_counts: Option<MaxCounts>,
) -> Result<()> {
    //record new farm details
    let farm = &mut ctx.accounts.farm;

    farm.version = LATEST_FARM_VERSION;
    farm.farm_manager = ctx.accounts.farm_manager.key();
    farm.farm_treasury = ctx.accounts.farm_treasury.key();
    farm.farm_authority = ctx.accounts.farm_authority.key();
    farm.farm_authority_seed = farm.key();
    farm.farm_authority_bump_seed = [bump_auth];
    farm.bank = ctx.accounts.bank.key();
    farm.config = farm_config;

    farm.reward_a.reward_mint = ctx.accounts.reward_a_mint.key();
    farm.reward_a.reward_pot = ctx.accounts.reward_a_pot.key();
    farm.reward_a.reward_type = reward_type_a;
    farm.reward_a.fixed_rate.schedule = FixedRateSchedule::default(); //denom to 1

    farm.reward_b.reward_mint = ctx.accounts.reward_b_mint.key();
    farm.reward_b.reward_pot = ctx.accounts.reward_b_pot.key();
    farm.reward_b.reward_type = reward_type_b;
    farm.reward_b.fixed_rate.schedule = FixedRateSchedule::default(); //denom to 1

    if let Some(max_counts) = max_counts {
        farm.max_counts = max_counts;
    }

    //do a cpi call to start a new bank
    gem_bank::cpi::init_bank(
        ctx.accounts
            .init_bank_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
    )?;

    //collect a fee for starting a farm
    ctx.accounts.transfer_fee()?;

    msg!("new farm initialized");
    Ok(())
}
