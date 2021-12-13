use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitBank<'info> {
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Bank>())]
    pub bank: Account<'info, Bank>,
    // it is possible that the manager will be an authority PDA, so it can't be payer
    pub bank_manager: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitBank>) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;

    bank.version = LATEST_BANK_VERSION;
    bank.bank_manager = ctx.accounts.bank_manager.key();
    bank.whitelisted_creators = 0;
    bank.whitelisted_mints = 0;
    bank.vault_count = 0;

    msg!("bank initialized, version {}", bank.version);
    Ok(())
}
