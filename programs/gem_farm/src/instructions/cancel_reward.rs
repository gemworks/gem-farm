use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_pot: u8)]
pub struct CancelReward<'info> {
    // farm
    #[account(mut, has_one = farm_manager, has_one = farm_authority)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,

    // reward
    #[account(mut, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_mint.key().as_ref(),
        ],
        bump = bump_pot)]
    pub reward_pot: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed,
        associated_token::mint = reward_mint,
        associated_token::authority = receiver,
        payer = farm_manager)]
    pub reward_destination: Box<Account<'info, TokenAccount>>,
    pub reward_mint: Box<Account<'info, Mint>>,
    // unlike with funding, cancelled proceeds can be sent anywhere
    /// CHECK:
    #[account(mut)]
    pub receiver: AccountInfo<'info>,

    // misc
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> CancelReward<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reward_pot.to_account_info(),
                to: self.reward_destination.to_account_info(),
                authority: self.farm_authority.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<CancelReward>) -> Result<()> {
    // update existing rewards
    let farm = &mut ctx.accounts.farm;
    let now_ts = now_ts()?;

    farm.update_rewards(now_ts, None, true)?;

    // calculate cancellation amount while recording cancellation
    let cancel_amount = farm.cancel_reward_by_mint(now_ts, ctx.accounts.reward_mint.key())?;

    // do the transfer
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        cancel_amount,
    )?;

    msg!(
        "{} reward cancelled, {} tokens refunded",
        ctx.accounts.reward_mint.key(),
        cancel_amount,
    );
    Ok(())
}
