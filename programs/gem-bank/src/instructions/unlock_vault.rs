use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UnlockVault<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<UnlockVault>) -> ProgramResult {
    let vault = &mut ctx.accounts.vault;

    vault.locked = false;

    msg!("vault {} unlocked", vault.key());
    Ok(())
}
