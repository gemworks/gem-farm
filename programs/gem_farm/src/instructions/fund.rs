use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_proof: u8, bump_rdr: u8, bump_pot: u8)]
pub struct Fund<'info> {
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
    #[account(init_if_needed, seeds = [
            b"rewards_deposit_receipt".as_ref(),
            authorized_funder.key().as_ref(),
            rewards_mint.key().as_ref(),
        ],
        bump = bump_rdr,
        payer = authorized_funder,
        space = 8 + std::mem::size_of::<RewardsDepositReceipt>())]
    pub rewards_deposit_receipt: Box<Account<'info, RewardsDepositReceipt>>,
    #[account(init_if_needed,
        seeds = [
            b"rewards_pot".as_ref(),
            farm.key().as_ref(),
            rewards_mint.key().as_ref(),
        ],
        bump = bump_pot,
        token::mint = rewards_mint,
        token::authority = farm_authority,
        payer = authorized_funder)]
    pub rewards_pot: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub rewards_source: Box<Account<'info, TokenAccount>>,
    pub rewards_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub authorized_funder: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Fund<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.rewards_source.to_account_info(),
                to: self.rewards_pot.to_account_info(),
                authority: self.authorized_funder.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<Fund>, amount: u64) -> ProgramResult {
    // do the transfer
    let farm = &ctx.accounts.farm;

    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&farm.farm_seeds()]),
        amount,
    )?;

    // record total number of funded pots
    let rewards_pot = &ctx.accounts.rewards_pot;
    let farm = &mut ctx.accounts.farm;

    // if all funds in the pot are new funds, then we increment the counts
    if rewards_pot.amount == 0 {
        farm.funded_rewards_pots.try_self_add(1);
        farm.active_rewards_pots.try_self_add(1);
    }

    // record a rdr
    let rdr = &mut ctx.accounts.rewards_deposit_receipt;
    rdr.farm = farm.key();
    rdr.rewards_pot = ctx.accounts.rewards_pot.key();
    rdr.rewards_mint = ctx.accounts.rewards_mint.key();
    rdr.initial_amount = amount;
    rdr.remaining_amount = amount;

    msg!(
        "{} reward tokens deposited into {} pot",
        amount,
        ctx.accounts.rewards_pot.key()
    );
    Ok(())
}
