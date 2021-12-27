use anchor_lang::prelude::*;
use gem_bank::{self, cpi::accounts::RemoveFromWhitelist, program::GemBank, state::Bank};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8)]
pub struct RemoveFromBankWhitelist<'info> {
    #[account(has_one = farm_manager, has_one = farm_authority)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    #[account(mut, seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,

    // cpi
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    pub address_to_remove: AccountInfo<'info>,
    #[account(mut)]
    pub whitelist_proof: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,
}

impl<'info> RemoveFromBankWhitelist<'info> {
    fn remove_from_whitelist_ctx(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, RemoveFromWhitelist<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            RemoveFromWhitelist {
                bank: self.bank.to_account_info(),
                bank_manager: self.farm_authority.clone(),
                address_to_remove: self.address_to_remove.clone(),
                whitelist_proof: self.whitelist_proof.clone(),
            },
        )
    }
}

pub fn handler(ctx: Context<RemoveFromBankWhitelist>, bump_wl: u8) -> ProgramResult {
    gem_bank::cpi::remove_from_whitelist(
        ctx.accounts
            .remove_from_whitelist_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        bump_wl,
    )?;

    msg!(
        "{} removed from bank whitelist",
        &ctx.accounts.address_to_remove.key()
    );
    Ok(())
}
