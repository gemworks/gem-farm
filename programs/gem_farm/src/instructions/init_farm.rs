use anchor_lang::prelude::*;
use gem_bank::program::GemBank;
use gem_bank::{self, cpi::accounts::InitBank, state::Bank};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitFarm<'info> {
    // core
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Farm>())]
    pub farm: Account<'info, Farm>,
    pub farm_manager: Signer<'info>,
    #[account(mut, seeds = [farm.key().as_ref()], bump = bump)]
    pub farm_authority: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,

    // cpi
    // todo should it be less opinionated and simply take in a pre-made bank?
    //  current thinking no: coz we NEED the bank to be managed by the farm authority
    #[account(mut)]
    pub bank: Signer<'info>,
    pub gem_bank: Program<'info, GemBank>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitFarm<'info> {
    fn init_bank_ctx(&self) -> CpiContext<'_, '_, '_, 'info, InitBank<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            InitBank {
                bank: self.bank.to_account_info(),
                // using farm_authority not farm_manager, coz latter can be re-assigned
                bank_manager: self.farm_authority.clone(),
                payer: self.payer.to_account_info(),
                system_program: self.system_program.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<InitFarm>, bump: u8) -> ProgramResult {
    //record new farm details
    let farm_key = ctx.accounts.farm.key().clone();
    let farm = &mut ctx.accounts.farm;

    farm.version = LATEST_FARM_VERSION;
    farm.farm_manager = ctx.accounts.farm_manager.key();
    farm.farm_authority = ctx.accounts.farm_authority.key();
    farm.farm_authority_seed = farm_key;
    farm.farm_authority_bump_seed = [bump];
    farm.bank = ctx.accounts.bank.key();

    // todo worth manually init'ing all the variables at 0s?

    //do a cpi call to start a new bank
    gem_bank::cpi::init_bank(
        ctx.accounts
            .init_bank_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
    )?;

    msg!("new farm initialized");
    Ok(())
}
