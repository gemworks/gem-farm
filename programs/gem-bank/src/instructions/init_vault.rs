use crate::errors::ErrorCode;
use crate::math::*;
use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub bank: Account<'info, Bank>,
    #[account(init,
        seeds = [
            b"vault".as_ref(),
            bank.key().as_ref(),
            creator.key().as_ref(),
        ],
        bump = bump,
        payer = creator,
        space = 8 + std::mem::size_of::<Vault>())]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    // (!) used for PDA initial derivation - CANNOT BE CHANGED
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitVault>, owner: Pubkey) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    bank.vault_count.try_self_add(1)?;

    vault.bank = bank.key();
    // todo is it wise that we're letting them set the owner w/o checking signature?
    //  what if they accidentally set the wrong one? The vault will be frozen forever.
    vault.owner = owner;
    vault.creator = ctx.accounts.creator.key();

    let vault_address = vault.key();
    let authority_seed = &[vault_address.as_ref()];
    let (authority, bump) = Pubkey::find_program_address(authority_seed, ctx.program_id);
    vault.authority = authority;
    vault.authority_seed = vault_address;
    vault.authority_bump_seed = [bump];

    vault.locked = false;
    vault.gem_box_count = 0;

    msg!("new vault founded by {}", &ctx.accounts.creator.key());
    Ok(())
}
