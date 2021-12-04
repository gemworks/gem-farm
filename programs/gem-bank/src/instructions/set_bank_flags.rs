use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::state::*;

#[derive(Accounts)]
pub struct SetBankFlags<'info> {
    #[account(mut, has_one = manager)]
    pub bank: Account<'info, Bank>,
    pub manager: Signer<'info>,
}

pub fn handler(ctx: Context<SetBankFlags>, flags: u64) -> ProgramResult {
    let bank = &mut ctx.accounts.bank;

    let flags = match BankFlags::from_bits(flags) {
        Some(f) => f,
        None => return Err(ErrorCode::InvalidParameter.into()),
    };
    bank.reset_flags(flags);

    msg!("flags set: {:?}", flags);
    Ok(())
}
