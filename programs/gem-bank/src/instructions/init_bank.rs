use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitBank<'info> {
    #[account(init, payer = keeper, space = 8 + std::mem::size_of::<Bank>())]
    pub bank: Account<'info, Bank>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitBank>) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;

    bank.version = LATEST_BANK_VERSION;
    bank.keeper = ctx.accounts.keeper.key();
    bank.vault_count = 0;

    msg!("bank initialized, version {}", bank.version);

    Ok(())
}
