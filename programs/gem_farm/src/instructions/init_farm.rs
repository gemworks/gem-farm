use anchor_lang::prelude::*;
use gem_bank::program::GemBank;
use gem_bank::{self, cpi::accounts::InitBank, state::Bank};

use crate::state::*;

#[derive(Accounts)]
// #[instruction(bump: u8)]
pub struct InitFarm<'info> {
    #[account(init, payer = farm_manager, space = 8 + std::mem::size_of::<Farm>())]
    pub farm: Account<'info, Farm>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    pub system_program: Program<'info, System>,

    // #[account(seeds = [farm.key().as_ref()], bump = bump)]
    // pub authority: AccountInfo<'info>,

    // todo should it be less opinionated and simply take in a pre-made bank?
    #[account(mut)]
    pub bank: Signer<'info>,
    // todo is this doing enough validation?
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> InitFarm<'info> {
    fn init_bank_ctx(&self) -> CpiContext<'_, '_, '_, 'info, InitBank<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            InitBank {
                bank: self.bank.to_account_info(),
                // manager: Signer::try_from(&self.authority).unwrap(),
                manager: self.farm_manager.to_account_info(),
                system_program: self.system_program.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<InitFarm>) -> ProgramResult {
    //do a cpi call to start a new bank
    gem_bank::cpi::init_bank(ctx.accounts.init_bank_ctx());
    msg!("done");

    //record new farm details
    let farm = &mut ctx.accounts.farm;
    farm.farm_manager = ctx.accounts.farm_manager.key();
    farm.bank = ctx.accounts.bank.key();
    farm.version = LATEST_FARM_VERSION;
    // farm.authority = ctx.accounts.authority.key();
    // farm.authority_seed = ctx.accounts.farm.key();
    // farm.authority_bump_seed = [bump];

    farm.funder_count = 0;
    farm.farmer_count = 0;

    msg!("new farm initialized");
    Ok(())
}
