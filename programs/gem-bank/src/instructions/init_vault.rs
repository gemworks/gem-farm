use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitVault<'info> {
    #[account(init,
        seeds = [
            b"vault".as_ref(),
            bank.key().as_ref(),
            &(bank.vault_count + 1).to_le_bytes(),
        ],
        bump = bump,
        payer = owner,
        space = 8 + std::mem::size_of::<Vault>())]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    let new_vault_id = bank.vault_count + 1;
    bank.vault_count = new_vault_id;
    vault.vault_id = new_vault_id;

    msg!("vault #{} initialized", new_vault_id);
    Ok(())
}
