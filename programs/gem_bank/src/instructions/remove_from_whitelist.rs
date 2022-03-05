use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct RemoveFromWhitelist<'info> {
    // bank
    #[account(mut, has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,
    /// CHECK:
    #[account(mut)]
    pub funds_receiver: AccountInfo<'info>,

    // whitelist
    /// CHECK:
    pub address_to_remove: AccountInfo<'info>,
    #[account(mut, has_one = bank, seeds = [
            b"whitelist".as_ref(),
            bank.key().as_ref(),
            address_to_remove.key().as_ref(),
        ],
        bump = bump)]
    pub whitelist_proof: Box<Account<'info, WhitelistProof>>,
}

pub fn handler(ctx: Context<RemoveFromWhitelist>) -> Result<()> {
    // decrement whitelist counter on bank
    let bank = &mut ctx.accounts.bank;
    let proof = &mut ctx.accounts.whitelist_proof;

    if let Ok(()) = proof.contains_type(WhitelistType::MINT) {
        bank.whitelisted_mints.try_sub_assign(1)?;
    }
    if let Ok(()) = proof.contains_type(WhitelistType::CREATOR) {
        bank.whitelisted_creators.try_sub_assign(1)?;
    }

    // delete whitelist proof
    close_account(
        &mut proof.to_account_info(),
        &mut ctx.accounts.funds_receiver,
    )?;

    // msg!(
    //     "{} removed from whitelist",
    //     &ctx.accounts.address_to_remove.key()
    // );
    Ok(())
}
