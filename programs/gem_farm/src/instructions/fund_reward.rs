use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_proof: u8, bump_pot: u8)]
pub struct FundReward<'info> {
    // farm
    #[account(mut)]
    pub farm: Box<Account<'info, Farm>>,

    // funder
    #[account(has_one = farm, has_one = authorized_funder, seeds = [
            b"authorization".as_ref(),
            farm.key().as_ref(),
            authorized_funder.key().as_ref(),
        ],
        bump = bump_proof)]
    pub authorization_proof: Box<Account<'info, AuthorizationProof>>,
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

impl<'info> FundReward<'info> {
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

pub fn handler(
    ctx: Context<FundReward>,
    variable_rate_config: Option<VariableRateConfig>,
    fixed_rate_config: Option<FixedRateConfig>,
) -> Result<()> {
    let amount = if let Some(config) = variable_rate_config {
        config.amount
    } else {
        fixed_rate_config.unwrap().amount
    };

    // update existing rewards + record new ones
    let farm = &mut ctx.accounts.farm;
    let now_ts = now_ts()?;

    farm.update_rewards(now_ts, None, true)?;

    farm.fund_reward_by_mint(
        now_ts,
        ctx.accounts.reward_mint.key(),
        variable_rate_config,
        fixed_rate_config,
    )?;

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
