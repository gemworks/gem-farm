use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct Stake {}

pub fn handler(ctx: Context<Stake>) -> ProgramResult {
    msg!("gems staked");
    Ok(())
}
