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
        payer = payer,
        space = 8 + std::mem::size_of::<Vault>())]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>, authority: Pubkey) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    let new_vault_id = bank.vault_count + 1;
    bank.vault_count = new_vault_id;
    vault.vault_id = new_vault_id;
    // todo is it wise that we're letting them set the authority w/o checking signature?
    //  what if they accidentally set the wrong one? The vault will be frozen forever.
    vault.authority = authority;

    msg!("vault #{} initialized", new_vault_id);
    Ok(())
}
