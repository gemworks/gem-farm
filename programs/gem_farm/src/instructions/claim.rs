use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_farmer: u8, bump_pot_a: u8, bump_pot_b: u8)]
pub struct Claim<'info> {
    // farm
    #[account(mut, has_one = farm_authority)]
    pub farm: Box<Account<'info, Farm>>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,

    // farmer
    #[account(mut, has_one = farm, has_one = identity, seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump_farmer)]
    pub farmer: Box<Account<'info, Farmer>>,
    #[account(mut)] //payer
    pub identity: Signer<'info>,

    // reward a
    #[account(mut, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_a_mint.key().as_ref(),
        ],
        bump = bump_pot_a)]
    pub reward_a_pot: Box<Account<'info, TokenAccount>>,
    pub reward_a_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed,
        associated_token::mint = reward_a_mint,
        associated_token::authority = identity,
        payer = identity)]
    pub reward_a_destination: Box<Account<'info, TokenAccount>>,

    // reward b
    #[account(mut, seeds = [
            b"reward_pot".as_ref(),
            farm.key().as_ref(),
            reward_b_mint.key().as_ref(),
        ],
        bump = bump_pot_b)]
    pub reward_b_pot: Box<Account<'info, TokenAccount>>,
    pub reward_b_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed,
        associated_token::mint = reward_b_mint,
        associated_token::authority = identity,
        payer = identity)]
    pub reward_b_destination: Box<Account<'info, TokenAccount>>,

    // misc
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Claim<'info> {
    fn transfer_a_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reward_a_pot.to_account_info(),
                to: self.reward_a_destination.to_account_info(),
                authority: self.farm_authority.to_account_info(),
            },
        )
    }

    fn transfer_b_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.reward_b_pot.to_account_info(),
                to: self.reward_b_destination.to_account_info(),
                authority: self.farm_authority.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    // update accrued rewards before claiming
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;

    farm.update_rewards(now_ts()?, Some(farmer), true)?;

    // calculate claimed amounts (capped at what's available in the pot)
    let to_claim_a = farmer
        .reward_a
        .claim_reward(ctx.accounts.reward_a_pot.amount)?;
    let to_claim_b = farmer
        .reward_b
        .claim_reward(ctx.accounts.reward_b_pot.amount)?;

    // do the transfers
    if to_claim_a > 0 {
        token::transfer(
            ctx.accounts
                .transfer_a_ctx()
                .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
            to_claim_a,
        )?;
    }
    if to_claim_b > 0 {
        token::transfer(
            ctx.accounts
                .transfer_b_ctx()
                .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
            to_claim_b,
        )?;
    }

    msg!("rewards claimed ({} A) and ({} B)", to_claim_a, to_claim_b);
    Ok(())
}
