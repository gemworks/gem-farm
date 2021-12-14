use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct DeauthorizeFunder {}

pub fn handler(ctx: Context<DeauthorizeFunder>) -> ProgramResult {
    msg!("funder deauthorized");
    Ok(())
}
