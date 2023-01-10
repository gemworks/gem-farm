use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
#[derive(Accounts)]
pub struct WithdrawTokensFromVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK
    #[account(seeds = [vault.key().as_ref()], bump = vault.authority_bump_seed[0])]
    pub authority: AccountInfo<'info>,
    #[account(mut,  associated_token::authority = vault, associated_token::mint = mint)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)] //
    pub vault: Box<Account<'info, Vault>>,
    #[account(init_if_needed,
        associated_token::mint = mint,
        associated_token::authority = owner,
        payer = owner)]
    pub recipient_ata: Account<'info, TokenAccount>,
    // pub mint: Account<'info, Mint>,
    pub mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub bank: Box<Account<'info, Bank>>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> WithdrawTokensFromVault<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_ata.to_account_info(),   // Transferee ATA
                authority: self.vault.to_account_info(),  // Vault PDA that can sign fot the SPL ATA
                to: self.recipient_ata.to_account_info(), // Recipient ATA
            },
        )
    }
}
// Cleans the vault
pub fn withdraw_tokens_vault(ctx: Context<WithdrawTokensFromVault>) -> Result<()> {
    let vault: &Box<Account<Vault>> = &ctx.accounts.vault;
    let vault_ata: &Pubkey = &ctx.accounts.vault_ata.clone().key();
    let bank: &Pubkey = &ctx.accounts.bank.clone().key();
    let creator: &Pubkey = &&vault.creator;

    // bump for vault PDA
    let seed = &[b"vault".as_ref(), bank.as_ref(), &&vault.creator.as_ref()];
    let (vault_pda, bump2) =
        anchor_lang::prelude::Pubkey::find_program_address(seed, &ctx.program_id);
    let seed_with_bump = &[b"vault".as_ref(), bank.as_ref(), creator.as_ref(), &[bump2]];

    let (gem_box_pda, _) = anchor_lang::prelude::Pubkey::find_program_address(
        &[
            b"gem_deposit_receipt".as_ref(),
            vault.key().as_ref(),
            &ctx.accounts.mint.key().as_ref(),
        ],
        &ctx.program_id,
    );

    //  vault_ata != gem_box PDA
    assert_ne!(gem_box_pda, *vault_ata);
    assert_ne!(gem_box_pda, vault_pda);

    // Transfer full balance to the recipient ATA
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&seed_with_bump[..]]),
        ctx.accounts.vault_ata.amount,
    )?;
    Ok(())
}
