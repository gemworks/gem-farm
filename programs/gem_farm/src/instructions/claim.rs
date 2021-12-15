use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::state::*;

use gem_common::errors::ErrorCode;
use gem_common::*;

#[derive(Accounts)]
#[instruction(bump_farmer: u8, bump_pot: u8)]
pub struct Claim<'info> {
    // core
    pub farm: Account<'info, Farm>,
    #[account(mut, has_one = farm, has_one = identity,
        seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump_farmer)]
    pub farmer: Account<'info, Farmer>,
    #[account(mut)] //payer
    pub identity: Signer<'info>,

    // reward
    pub reward_mint: Account<'info, Mint>,
    #[account(mut, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_mint.key().as_ref(),
        ],
        bump = bump_pot)]
    pub reward_pot: Account<'info, TokenAccount>,
    #[account(init_if_needed,
        associated_token::mint = reward_mint,
        associated_token::authority = identity,
        payer = identity)]
    pub reward_destination: Account<'info, TokenAccount>,

    // misc
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Claim>) -> ProgramResult {
    msg!("reward claimed");
    Ok(())
}
