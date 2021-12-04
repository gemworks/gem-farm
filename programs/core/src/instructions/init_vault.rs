use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitVault<'info> {
    // has to be a PDA, otherwise how do you iterate over all vaults for a given shardr
    #[account(init,
        seeds = [
            b"vault".as_ref(),
            shardr.key().as_ref(),
            &(shardr.load()?.vault_count + 1).to_le_bytes(),
        ],
        bump = bump,
        payer = owner,
        space = 8 + std::mem::size_of::<Vault>())]
    pub vault: AccountLoader<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub shardr: AccountLoader<'info, Shardr>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>) -> ProgramResult {
    msg!("vault initialized, {}", ctx.accounts.vault.key());
    Ok(())
}
