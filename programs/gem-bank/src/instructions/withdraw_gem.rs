use crate::errors::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::*;

#[derive(Accounts)]
pub struct WithdrawGem<'info> {
    // needed for checking flags
    pub bank: Box<Account<'info, Bank>>,
    // needed for seeds derivation
    #[account(has_one = owner, has_one = authority)]
    pub vault: Account<'info, Vault>,
    // this ensures only the owner can withdraw
    #[account(mut)]
    pub owner: Signer<'info>,
    // needed to sign token transfer
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(init_if_needed,
        associated_token::mint = gem_mint,
        associated_token::authority = receiver,
        payer = owner,
    )]
    pub gem_destination: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    pub receiver: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> WithdrawGem<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.gem_box.to_account_info(),
                to: self.gem_destination.to_account_info(),
                authority: self.authority.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<WithdrawGem>, amount: u64) -> ProgramResult {
    let bank = &*ctx.accounts.bank;
    let gem_box = &*ctx.accounts.gem_box;
    let vault = &ctx.accounts.vault;

    if vault.access_suspended(bank.flags)? {
        return Err(ErrorCode::VaultAccessSuspended.into());
    }

    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&vault.vault_seeds()]),
        amount,
    )?;

    // needs to go after transfer, otherwise borrow conflict
    let gdr = &mut *ctx.accounts.gem_deposit_receipt;

    // todo turn this into a math lib
    gdr.gem_amount = gdr
        .gem_amount
        .checked_sub(amount)
        .ok_or::<ProgramError>(ErrorCode::ArithmeticError.into())?;

    // todo if amount 0, we should close both the GDR and the gem box

    // this check is semi-useless but won't hurt
    if gdr.gem_amount != gem_box.amount - amount {
        return Err(ErrorCode::AmountMismatch.into());
    }

    msg!("{} gems withdrawn from ${} gem box", amount, gem_box.key());
    Ok(())
}
