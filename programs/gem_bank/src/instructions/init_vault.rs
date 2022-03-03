use std::io::Write;

use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitVault<'info> {
    // bank
    #[account(mut)]
    pub bank: Box<Account<'info, Bank>>,

    // vault
    #[account(init, seeds = [
            b"vault".as_ref(),
            bank.key().as_ref(),
            creator.key().as_ref(),
        ],
        bump,
        payer = payer,
        space = 8 + std::mem::size_of::<Vault>())]
    pub vault: Box<Account<'info, Vault>>,
    pub creator: Signer<'info>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>, owner: Pubkey, name: String) -> Result<()> {
    // record total number of vaults in bank's state
    let bank = &mut ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    bank.vault_count.try_add_assign(1)?;

    // derive the authority responsible for all token transfers within the new vault
    let vault_address = vault.key();
    let authority_seed = &[vault_address.as_ref()];
    let (authority, bump) = Pubkey::find_program_address(authority_seed, ctx.program_id);

    // record vault's state
    vault.bank = bank.key();
    vault.owner = owner;
    vault.creator = ctx.accounts.creator.key();
    vault.authority = authority;
    vault.authority_seed = vault_address;
    vault.authority_bump_seed = [bump];
    vault.locked = false;
    (&mut vault.name[..]).write_all(name.as_bytes())?;

    //msg!("new vault founded by {}", &ctx.accounts.creator.key());
    Ok(())
}
