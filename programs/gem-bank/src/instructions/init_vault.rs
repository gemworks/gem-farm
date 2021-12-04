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
    pub bank: Account<'info, Bank>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    bank.vault_count += 1;
    vault.vault_id = bank.vault_count;

    msg!("vault #{} initialized", vault.vault_id);
    Ok(())
}
