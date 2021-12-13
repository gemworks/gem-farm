use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct Unstake {}

pub fn handler(ctx: Context<Unstake>) -> ProgramResult {
    msg!("gems unstaked");
    Ok(())
}
