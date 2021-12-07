use crate::errors::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_gem_box: u8, bump_gdr: u8)]
pub struct DepositGem<'info> {
    // needed for checking flags
    pub bank: Box<Account<'info, Bank>>,
    // needed for seeds derivation + we increment gem box count
    #[account(mut, has_one = owner, has_one = authority)]
    pub vault: Account<'info, Vault>,
    // this ensures only the owner can deposit
    pub owner: Signer<'info>,
    // needed to be set as authority over newly created token PDA
    pub authority: AccountInfo<'info>,
    #[account(init_if_needed,
        seeds = [
            b"gem_box".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump_gem_box,
        token::mint = gem_mint,
        token::authority = authority,
        payer = depositor,
    )]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed,
        seeds = [
            b"gem_deposit_receipt".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump_gdr,
        payer = depositor,
        space = 8 + std::mem::size_of::<GemDepositReceipt>()
    )]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(mut)]
    pub gem_source: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> DepositGem<'info> {
    fn transfer_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.gem_source.to_account_info(),
                to: self.gem_box.to_account_info(),
                authority: self.depositor.to_account_info(),
            },
        )
    }
}

pub fn handler(ctx: Context<DepositGem>, amount: u64) -> ProgramResult {
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

    // these 2 need to go after transfer, otherwise borrow conflict
    let vault = &mut ctx.accounts.vault;
    let gdr = &mut *ctx.accounts.gem_deposit_receipt;

    vault.gem_box_count = vault
        .gem_box_count
        .checked_add(1)
        .ok_or::<ProgramError>(ErrorCode::ArithmeticError.into())?;

    gdr.vault = vault.key();
    gdr.gem_box_address = gem_box.key();
    gdr.gem_mint = gem_box.mint;
    gdr.gem_amount = gdr
        .gem_amount
        .checked_add(amount)
        .ok_or::<ProgramError>(ErrorCode::ArithmeticError.into())?;

    // this check is semi-useless but won't hurt
    if gdr.gem_amount != gem_box.amount + amount {
        return Err(ErrorCode::AmountMismatch.into());
    }

    msg!("{} gems deposited into ${} gem box", amount, gem_box.key());
    Ok(())
}
