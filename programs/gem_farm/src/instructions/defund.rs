use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::rewards::update_accrued_rewards;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_proof: u8, bump_fr: u8, bump_pot: u8)]
pub struct Defund<'info> {
    // farm
    #[account(mut)]
    pub farm: Account<'info, Farm>,
    pub farm_authority: AccountInfo<'info>,

    // funder
    #[account(has_one = farm, has_one = authorized_funder ,seeds = [
            b"authorization".as_ref(),
            farm.key().as_ref(),
            authorized_funder.key().as_ref(),
        ],
        bump = bump_proof)]
    pub authorization_proof: Account<'info, AuthorizationProof>,
    #[account(mut)]
    pub authorized_funder: Signer<'info>,
    #[account(mut, seeds = [
            b"funding_receipt".as_ref(),
            authorized_funder.key().as_ref(),
            reward_mint.key().as_ref(),
        ],
        bump = bump_fr)]
    pub funding_receipt: Box<Account<'info, FundingReceipt>>,

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
        associated_token::authority = authorized_funder,
        payer = authorized_funder)]
    pub reward_destination: Box<Account<'info, TokenAccount>>,
    pub reward_mint: Box<Account<'info, Mint>>,

    // misc
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Defund<'info> {
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

pub fn handler(ctx: Context<Defund>, desired_amount: u64) -> ProgramResult {
    let now_ts = now_ts()?;

    // update existing rewards
    let farm = &mut ctx.accounts.farm;
    let receipt = &ctx.accounts.funding_receipt;

    update_accrued_rewards(farm, None)?;

    // calculate defund amount & update rate
    let funder_withdrawable_amount = receipt.funder_withdrawable_amount()?;
    let to_defund = farm.defund_reward_by_mint(
        now_ts,
        funder_withdrawable_amount,
        desired_amount,
        ctx.accounts.reward_mint.key(),
    )?;

    // update fr
    let fr = &mut ctx.accounts.funding_receipt;
    fr.total_withdrawn_amount.try_self_add(to_defund)?;
    fr.withdrawal_count.try_self_add(1)?;
    fr.last_withdrawal_ts = now_ts;

    // do the transfer
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        to_defund,
    )?;

    msg!(
        "{} reward tokens withdrawn from {} pot",
        to_defund,
        ctx.accounts.reward_pot.key()
    );
    Ok(())
}
