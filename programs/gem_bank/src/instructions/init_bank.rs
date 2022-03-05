use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitBank<'info> {
    // bank
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Bank>())]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitBank>) -> Result<()> {
    let bank = &mut ctx.accounts.bank;

    bank.version = LATEST_BANK_VERSION;
    bank.bank_manager = ctx.accounts.bank_manager.key();

    //msg!("bank initialized, version {}", bank.version);
    Ok(())
}
