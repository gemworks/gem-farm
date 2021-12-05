use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateVaultOwner<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateVaultOwner>, new_owner: Pubkey) -> ProgramResult {
    let vault = &mut ctx.accounts.vault;

    // todo is it wise that we're letting them set the owner w/o checking signature?
    //  what if they accidentally set the wrong one? The vault will be frozen forever.
    vault.owner = new_owner;

    msg!("owner updated to: {}", new_owner);
    Ok(())
}
