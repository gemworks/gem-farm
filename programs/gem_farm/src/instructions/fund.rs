use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct Fund {}

pub fn handler(ctx: Context<Fund>) -> ProgramResult {
    msg!("farm funded");
    Ok(())
}
