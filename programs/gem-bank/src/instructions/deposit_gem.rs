use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, Transfer};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct DepositGem<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    // by having authority be a signer, we ensure that only vault authority can deposit into the vault
    pub authority: Signer<'info>,
    // todo who should really be set as authority here? whoever will be able to transfer token out afterwards, correct?
    #[account(init,
        seeds = [
            b"gem_box".as_ref(),
            vault.key().as_ref(),
            &(vault.gem_box_count + 1).to_le_bytes(),
        ],
        bump = bump,
        token::mint = gem_mint,
        token::authority = authority,
        payer = depositor,
    )]
    pub gem_box: AccountInfo<'info>,
    #[account(mut)]
    pub gem_source: AccountInfo<'info>,
    pub gem_mint: Account<'info, Mint>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> DepositGem<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.gem_source.to_account_info(),
                to: self.gem_box.to_account_info(),
                authority: self.depositor.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<DepositGem>, amount: u64) -> ProgramResult {
    let gem_box = &ctx.accounts.gem_box;

    token::transfer(ctx.accounts.transfer_ctx(), amount)?;

    msg!("gem box for {} created", token::accessor::mint(&gem_box)?);
    Ok(())
}
