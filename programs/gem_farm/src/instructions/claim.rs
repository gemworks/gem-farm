use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct Claim {}

pub fn handler(ctx: Context<Claim>) -> ProgramResult {
    msg!("reward claimed");
    Ok(())
}
