use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct AddToWhitelist<'info> {
    // bank
    #[account(mut, has_one = bank_manager)]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub bank_manager: Signer<'info>,

    // whitelist
    pub address_to_whitelist: AccountInfo<'info>,
    // todo - is there any way someone could create this pda outside of this ix to fake-whitelist themselves?
    #[account(init_if_needed,
        seeds = [
            b"whitelist".as_ref(),
            bank.key().as_ref(),
            address_to_whitelist.key().as_ref(),
        ],
        bump = bump,
        payer = bank_manager,
        space = 8 + std::mem::size_of::<WhitelistProof>())]
    pub whitelist_proof: Account<'info, WhitelistProof>,

    // misc
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToWhitelist>, whitelist_type: u8) -> ProgramResult {
    // create/update whitelist proof
    let proof = &mut ctx.accounts.whitelist_proof;
    let whitelist_type = WhitelistProof::read_type(whitelist_type)?;

    proof.reset_type(whitelist_type);
    proof.whitelisted_address = ctx.accounts.address_to_whitelist.key();
    proof.bank = ctx.accounts.bank.key();

    // increment whitelist count on bank
    let bank = &mut ctx.accounts.bank;

    if whitelist_type.contains(WhitelistType::CREATOR) {
        bank.whitelisted_creators.try_self_add(1)?;
    }
    if whitelist_type.contains(WhitelistType::MINT) {
        bank.whitelisted_mints.try_self_add(1)?;
    }

    msg!(
        "{} added to whitelist",
        &ctx.accounts.address_to_whitelist.key()
    );
    Ok(())
}
