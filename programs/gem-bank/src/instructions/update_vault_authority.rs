use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateVaultAuthority<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateVaultAuthority>, new_authority: Pubkey) -> ProgramResult {
    let vault = &mut ctx.accounts.vault;

    // todo is it wise that we're letting them set the authority w/o checking signature?
    //  what if they accidentally set the wrong one? The vault will be frozen forever.
    vault.authority = new_authority;

    msg!("authority updated to: {}", new_authority);
    Ok(())
}
