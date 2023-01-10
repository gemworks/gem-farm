use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct CleanVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK
    #[account(seeds = [vault.key().as_ref()], bump = vault.authority_bump_seed[0])]
    pub authority: AccountInfo<'info>,
    #[account(mut,  associated_token::authority = vault, associated_token::mint = mint)]
    pub vault_ata: Account<'info, TokenAccount>,
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)] //
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub recipient_ata: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub bank: Box<Account<'info, Bank>>,
}
impl<'info> CleanVault<'info> {
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
pub fn clean_vault(ctx: Context<CleanVault>) -> Result<()> {
    let vault: &Box<Account<Vault>> = &ctx.accounts.vault;
    let vault_ata_balance: u64 = ctx.accounts.vault_ata.amount;
    let bank: &Pubkey = &ctx.accounts.bank.clone().key();
    let creator: &Pubkey = &&vault.creator;

    // Seeds
    let seed = &[b"vault".as_ref(), bank.as_ref(), &&vault.creator.as_ref()];
    let (_ata_address, bump2) =
        anchor_lang::prelude::Pubkey::find_program_address(seed, &ctx.program_id);

    let seed_with_bump = &[b"vault".as_ref(), bank.as_ref(), creator.as_ref(), &[bump2]];

    // Transfer full balance to the recipient ATA
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&seed_with_bump[..]]),
        vault_ata_balance,
    )?;
    Ok(())
}
