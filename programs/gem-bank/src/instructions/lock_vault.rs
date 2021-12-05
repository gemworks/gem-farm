use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct LockVault<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<LockVault>) -> ProgramResult {
    let vault = &mut ctx.accounts.vault;

    vault.locked = true;

    msg!("vault {} locked", vault.key());
    Ok(())
}
