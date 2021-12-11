use anchor_lang::prelude::*;

use crate::state::*;
use crate::utils::close_account;
use crate::utils::math::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct RemoveFromWhitelist<'info> {
    #[account(mut, has_one = manager)]
    bank: Account<'info, Bank>,
    address_to_remove: AccountInfo<'info>,
    #[account(mut)]
    manager: Signer<'info>,
    #[account(mut,
        seeds = [
            b"whitelist".as_ref(),
            bank.key().as_ref(),
            address_to_remove.key().as_ref(),
        ],
        bump = bump)]
    whitelist_proof: Account<'info, WhitelistProof>,
    system_program: Program<'info, System>, //todo needed?
}

pub fn handler(ctx: Context<RemoveFromWhitelist>) -> ProgramResult {
    // decrement whitelist counter on bank
    let bank = &mut ctx.accounts.bank;
    let proof = &mut ctx.accounts.whitelist_proof;

    if let Ok(()) = proof.contains_type(WhitelistType::MINT) {
        bank.whitelisted_mints.try_self_sub(1)?;
    }
    if let Ok(()) = proof.contains_type(WhitelistType::CREATOR) {
        bank.whitelisted_creators.try_self_sub(1)?;
    }

    // delete whitelist proof
    let manager = &mut ctx.accounts.manager.to_account_info();

    close_account(&mut proof.to_account_info(), manager)?;

    msg!(
        "{} removed from whitelist",
        &ctx.accounts.address_to_remove.key()
    );
    Ok(())
}
