use anchor_lang::prelude::*;
use gem_bank::{self, cpi::accounts::AddToWhitelist, program::GemBank, state::Bank};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8)]
pub struct AddToBankWhitelist<'info> {
    // farm
    #[account(has_one = farm_manager, has_one = farm_authority, has_one = bank)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,

    // cpi
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,
    /// CHECK:
    pub address_to_whitelist: AccountInfo<'info>,
    // trying to deserialize here leads to errors (doesn't exist yet)
    /// CHECK:
    #[account(mut)]
    pub whitelist_proof: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> AddToBankWhitelist<'info> {
    fn add_to_whitelist_ctx(&self) -> CpiContext<'_, '_, '_, 'info, AddToWhitelist<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            AddToWhitelist {
                bank: self.bank.to_account_info(),
                bank_manager: self.farm_authority.clone(),
                address_to_whitelist: self.address_to_whitelist.clone(),
                whitelist_proof: self.whitelist_proof.clone(),
                system_program: self.system_program.to_account_info(),
                payer: self.farm_manager.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<AddToBankWhitelist>, whitelist_type: u8) -> Result<()> {
    gem_bank::cpi::add_to_whitelist(
        ctx.accounts
            .add_to_whitelist_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        whitelist_type,
    )?;

    msg!(
        "{} added to bank whitelist",
        &ctx.accounts.address_to_whitelist.key()
    );
    Ok(())
}
