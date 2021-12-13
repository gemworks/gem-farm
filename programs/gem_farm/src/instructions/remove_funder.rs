use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct RemoveFunder {}

pub fn handler(ctx: Context<RemoveFunder>) -> ProgramResult {
    msg!("funder removed");
    Ok(())
}
