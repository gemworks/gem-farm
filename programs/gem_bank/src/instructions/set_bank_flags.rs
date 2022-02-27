use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct SetBankFlags<'info> {
    // bank
    #[account(mut, has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,
}

pub fn handler(ctx: Context<SetBankFlags>, flags: u32) -> Result<()> {
    let bank = &mut ctx.accounts.bank;

    let flags = Bank::read_flags(flags)?;
    bank.reset_flags(flags);

    //msg!("flags set: {:?}", flags);
    Ok(())
}
