use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateBankManager<'info> {
    // bank
    #[account(mut, has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateBankManager>, new_manager: Pubkey) -> Result<()> {
    let bank = &mut ctx.accounts.bank;

    bank.bank_manager = new_manager;

    //msg!("bank manager updated to: {}", new_manager);
    Ok(())
}
