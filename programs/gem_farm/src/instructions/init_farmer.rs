use anchor_lang::prelude::*;
use gem_bank::{self, cpi::accounts::InitVault, program::GemBank, state::Bank};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_farmer: u8, bump_vault: u8)]
pub struct InitFarmer<'info> {
    // farm
    #[account(mut)]
    pub farm: Account<'info, Farm>,

    // farmer
    #[account(init,
        seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump_farmer,
        payer = payer,
        space = 8 + std::mem::size_of::<Farmer>())]
    pub farmer: Account<'info, Farmer>,
    pub identity: Signer<'info>,

    // cpi
    // todo should it be less opinionated and simply take in a pre-made vault?
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
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
}

pub fn handler(ctx: Context<InitFarmer>, bump_vault: u8) -> ProgramResult {
    // record new farmer details
    let farmer = &mut ctx.accounts.farmer;

    farmer.farm = ctx.accounts.farm.key();
    farmer.identity = ctx.accounts.identity.key();
    farmer.vault = ctx.accounts.vault.key();

    // todo worth manually init'ing all the variables at 0s?

    // update farm
    let farm = &mut ctx.accounts.farm;

    farm.farmer_count.try_add_assign(1)?;

    // do a cpi call to start a new vault
    let vault_owner = ctx.accounts.identity.key();
    let vault_name = String::from("farm_vault"); //todo let them input custom

    gem_bank::cpi::init_vault(
        ctx.accounts.init_vault_ctx(),
        bump_vault,
        vault_owner,
        vault_name,
    )?;

    msg!("new farmer initialized");
    Ok(())
}
