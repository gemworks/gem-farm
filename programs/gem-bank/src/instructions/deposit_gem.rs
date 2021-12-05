use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct DepositGem<'info> {
    // needed for seeds derivation + we increment gem box count
    #[account(mut, has_one = owner, has_one = authority)]
    pub vault: Account<'info, Vault>,
    // this ensures only the owner can deposit
    pub owner: Signer<'info>,
    // needed to be set as authority over newly created token PDA
    pub authority: AccountInfo<'info>,
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
    pub gem_box: Account<'info, TokenAccount>,
    #[account(mut)]
    pub gem_source: Account<'info, TokenAccount>,
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
    let vault = &ctx.accounts.vault;
    let gem_box = &ctx.accounts.gem_box;

    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&vault.vault_seeds()]),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.gem_box_count += 1;

    msg!(
        "gem box for {} created and {} gems deposited",
        gem_box.mint,
        amount
    );
    Ok(())
}
