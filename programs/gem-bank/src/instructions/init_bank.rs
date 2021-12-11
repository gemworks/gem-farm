use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitBank<'info> {
    #[account(init, payer = manager, space = 8 + std::mem::size_of::<Bank>())]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub manager: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitBank>) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;

    bank.version = LATEST_BANK_VERSION;
    bank.manager = ctx.accounts.manager.key();
    bank.whitelisted_creators = 0;
    bank.whitelisted_mints = 0;
    bank.vault_count = 0;

    msg!("bank initialized, version {}", bank.version);
    Ok(())
}
