use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitFarmer {}

pub fn handler(ctx: Context<InitFarmer>) -> ProgramResult {
    msg!("new farmer initialized");
    Ok(())
}
