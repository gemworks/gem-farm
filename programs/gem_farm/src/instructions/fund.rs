use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::rewards::{post_new_reward, update_accrued_rewards};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_proof: u8, bump_pot: u8)]
pub struct Fund<'info> {
    // core
    #[account(mut)]
    pub farm: Account<'info, Farm>,
    pub farm_authority: AccountInfo<'info>,
    #[account(has_one = farm, has_one = authorized_funder ,seeds = [
            b"authorization".as_ref(),
            farm.key().as_ref(),
            authorized_funder.key().as_ref(),
        ],
        bump = bump_proof)]
    pub authorization_proof: Account<'info, AuthorizationProof>,
    #[account(mut)]
    pub authorized_funder: Signer<'info>,

    // reward
    #[account(mut, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_mint.key().as_ref(),
        ],
        bump = bump_pot)]
    pub reward_pot: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub reward_source: Box<Account<'info, TokenAccount>>,
    pub reward_mint: Box<Account<'info, Mint>>,

    // misc
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> Fund<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reward_source.to_account_info(),
                to: self.reward_pot.to_account_info(),
                authority: self.authorized_funder.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<Fund>, amount: u64, duration_sec: u64) -> ProgramResult {
    // update rewards + post new ones
    let farm = &mut ctx.accounts.farm;

    update_accrued_rewards(farm, None)?;
    post_new_reward(farm, amount, duration_sec, ctx.accounts.reward_mint.key())?;

    // do the transfer
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        amount,
    )?;

    msg!(
        "{} reward tokens deposited into {} pot",
        amount,
        ctx.accounts.reward_pot.key()
    );
    Ok(())
}
