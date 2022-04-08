use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use arrayref::array_ref;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
pub struct AddToWhitelist<'info> {
    // bank
    #[account(mut, has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,

    // whitelist
    /// CHECK:
    pub address_to_whitelist: AccountInfo<'info>,
    // must stay init_as_needed, otherwise no way to change afterwards
    #[account(init_if_needed,
        seeds = [
            b"whitelist".as_ref(),
            bank.key().as_ref(),
            address_to_whitelist.key().as_ref(),
        ],
        bump,
        payer = payer,
        space = 8 + std::mem::size_of::<WhitelistProof>())]
    pub whitelist_proof: Box<Account<'info, WhitelistProof>>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddToWhitelist>, whitelist_type: u8) -> Result<()> {
    // fix missing discriminator check
    {
        let acct = ctx.accounts.whitelist_proof.to_account_info();
        let data: &[u8] = &acct.try_borrow_data()?;
        let disc_bytes = array_ref![data, 0, 8];
        if disc_bytes != &WhitelistProof::discriminator() && disc_bytes.iter().any(|a| a != &0) {
            return Err(error!(ErrorCode::AccountDiscriminatorMismatch));
        }
    }

    // create/update whitelist proof
    let proof = &mut ctx.accounts.whitelist_proof;

    // if this is an update, decrement counts from existing whitelist
    if proof.whitelist_type > 0 {
        let existing_whitelist = WhitelistProof::read_type(proof.whitelist_type)?;
        let bank = &mut ctx.accounts.bank;

        if existing_whitelist.contains(WhitelistType::CREATOR) {
            bank.whitelisted_creators.try_sub_assign(1)?;
        }
        if existing_whitelist.contains(WhitelistType::MINT) {
            bank.whitelisted_mints.try_sub_assign(1)?;
        }
    }

    // record new whitelist and increment counts
    let new_whitelist = WhitelistProof::read_type(whitelist_type)?;

    proof.reset_type(new_whitelist);
    proof.whitelisted_address = ctx.accounts.address_to_whitelist.key();
    proof.bank = ctx.accounts.bank.key();

    let bank = &mut ctx.accounts.bank;

    if new_whitelist.contains(WhitelistType::CREATOR) {
        bank.whitelisted_creators.try_add_assign(1)?;
    }
    if new_whitelist.contains(WhitelistType::MINT) {
        bank.whitelisted_mints.try_add_assign(1)?;
    }

    // msg!(
    //     "{} added to whitelist",
    //     &ctx.accounts.address_to_whitelist.key()
    // );
    Ok(())
}
