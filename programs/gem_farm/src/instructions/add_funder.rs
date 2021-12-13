use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct AddFunder {}

pub fn handler(ctx: Context<AddFunder>) -> ProgramResult {
    msg!("funder added");
    Ok(())
}
