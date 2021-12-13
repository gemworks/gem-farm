use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateBankManager<'info> {
    #[account(mut, has_one = manager)]
    pub bank: Account<'info, Bank>,
    pub manager: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateBankManager>, new_manager: Pubkey) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;

    bank.manager = new_manager;

    msg!("bank manager updated to: {}", new_manager);
    Ok(())
}
