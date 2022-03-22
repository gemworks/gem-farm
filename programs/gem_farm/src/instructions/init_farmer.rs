use crate::instructions::FEE_WALLET;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use gem_bank::{self, cpi::accounts::InitVault, program::GemBank, state::Bank};
use gem_common::*;
use std::str::FromStr;

use crate::state::*;

const FEE_LAMPORTS: u64 = 10_000_000; // 0.01 SOL per farmer

#[derive(Accounts)]
pub struct InitFarmer<'info> {
    // farm
    #[account(mut, has_one = bank)]
    pub farm: Box<Account<'info, Farm>>,

    // farmer
    #[account(init, seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump,
        payer = payer,
        space = 8 + std::mem::size_of::<Farmer>())]
    pub farmer: Box<Account<'info, Farmer>>,
    pub identity: Signer<'info>,

    // cpi
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    // trying to deserialize here leads to errors (doesn't exist yet)
    /// CHECK:
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK:
    #[account(mut, address = Pubkey::from_str(FEE_WALLET).unwrap())]
    pub fee_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitFarmer<'info> {
    fn init_vault_ctx(&self) -> CpiContext<'_, '_, '_, 'info, InitVault<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            InitVault {
                bank: self.bank.to_account_info(),
                vault: self.vault.clone(),
                // creator = the identity of the farmer
                creator: self.identity.to_account_info(),
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

pub fn handler(ctx: Context<InitFarmer>) -> Result<()> {
    // record new farmer details
    let farmer = &mut ctx.accounts.farmer;

    farmer.farm = ctx.accounts.farm.key();
    farmer.identity = ctx.accounts.identity.key();
    farmer.vault = ctx.accounts.vault.key();
    farmer.reward_a.fixed_rate.promised_schedule = FixedRateSchedule::default(); //denom to 1
    farmer.reward_b.fixed_rate.promised_schedule = FixedRateSchedule::default(); //denom to 1

    // update farm
    let farm = &mut ctx.accounts.farm;

    farm.farmer_count.try_add_assign(1)?;

    // do a cpi call to start a new vault
    let vault_owner = ctx.accounts.identity.key();
    let vault_name = String::from("farm_vault");

    gem_bank::cpi::init_vault(ctx.accounts.init_vault_ctx(), vault_owner, vault_name)?;

    //collect a fee for starting a farm
    ctx.accounts.transfer_fee()?;

    msg!("new farmer initialized");
    Ok(())
}
