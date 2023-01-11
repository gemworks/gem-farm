use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use gem_common::errors::ErrorCode;

use crate::state::*;

#[derive(Accounts)]
pub struct WithdrawTokensAuthority<'info> {
    //bank
    pub bank: Box<Account<'info, Bank>>,

    //vault
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK:
    #[account(seeds = [vault.key().as_ref()], bump = vault.authority_bump_seed[0])]
    pub authority: AccountInfo<'info>,

    //token
    #[account(mut,
        token::mint = mint,
        token::authority = authority
    )]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(init_if_needed,
        associated_token::mint = mint,
        associated_token::authority = owner,
        payer = owner
    )]
    pub recipient_ata: Account<'info, TokenAccount>,
    pub mint: Box<Account<'info, Mint>>,

    //misc
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> WithdrawTokensAuthority<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_ata.to_account_info(),
                to: self.recipient_ata.to_account_info(),
                authority: self.authority.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<WithdrawTokensAuthority>) -> Result<()> {
    let vault: &Box<Account<Vault>> = &ctx.accounts.vault;
    let vault_ata: &Pubkey = &ctx.accounts.vault_ata.clone().key();

    // EXTREMELY IMPORTANT
    // Make sure that vault_ata != gem_box PDA, otherwise this ix can be used to bypass frozen lock
    let (gem_box_pda, _) = anchor_lang::prelude::Pubkey::find_program_address(
        &[
            b"gem_box".as_ref(),
            vault.key().as_ref(),
            &ctx.accounts.mint.key().as_ref(),
        ],
        &ctx.program_id,
    );
    if gem_box_pda == *vault_ata {
        return Err(error!(ErrorCode::TransferNotAllowed));
    }

    // Transfer full balance to the recipient ATA
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&vault.vault_seeds()]),
        ctx.accounts.vault_ata.amount,
    )?;
    Ok(())
}
