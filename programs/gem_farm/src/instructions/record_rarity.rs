// todo delete?

pub use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
pub use gem_common::*;

pub use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct RecordRarity<'info> {
    // farm
    #[account(has_one = farm_manager)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,

    // gem
    pub gem_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, seeds = [
            b"gem_rarity".as_ref(),
            farm.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump,
        payer = farm_manager,
        space = 8 + std::mem::size_of::<Rarity>())]
    pub gem_rarity: Box<Account<'info, Rarity>>,

    // misc
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RecordRarity>, rarity_points: u16) -> ProgramResult {
    let gem_rarity = &mut ctx.accounts.gem_rarity;

    gem_rarity.points = rarity_points;

    Ok(())
}
