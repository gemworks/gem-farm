use crate::instructions::calc_rarity_points;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};
use gem_common::{errors::ErrorCode, *};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_gem_box: u8, bump_gdr: u8, bump_rarity: u8)]
pub struct WithdrawGem<'info> {
    // bank
    pub bank: Box<Account<'info, Bank>>,

    // vault
    // same rationale for not verifying the PDA as in deposit
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK:
    #[account(seeds = [vault.key().as_ref()], bump = bump_auth)]
    pub authority: AccountInfo<'info>,

    // gem
    #[account(mut, seeds = [
            b"gem_box".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump_gem_box)]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(mut, has_one = vault, has_one = gem_mint, seeds = [
            b"gem_deposit_receipt".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump_gdr)]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(init_if_needed,
        associated_token::mint = gem_mint,
        associated_token::authority = receiver,
        payer = owner)]
    pub gem_destination: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    // we MUST ask for this PDA both during deposit and withdrawal for sec reasons, even if it's zero'ed
    /// CHECK:
    #[account(seeds = [
            b"gem_rarity".as_ref(),
            bank.key().as_ref(),
            gem_mint.key().as_ref()
        ], bump = bump_rarity)]
    pub gem_rarity: AccountInfo<'info>,
    // unlike with deposits, the gem can be sent out to anyone, not just the owner
    /// CHECK:
    #[account(mut)]
    pub receiver: AccountInfo<'info>,

    // misc
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

    fn close_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.gem_box.to_account_info(),
                destination: self.receiver.to_account_info(),
                authority: self.authority.clone(),
            },
        )
    }
}

pub fn handler(ctx: Context<WithdrawGem>, amount: u64) -> Result<()> {
    // verify vault not suspended
    let bank = &*ctx.accounts.bank;
    let vault = &ctx.accounts.vault;

    if vault.access_suspended(bank.flags)? {
        return Err(error!(ErrorCode::VaultAccessSuspended));
    }

    // do the transfer
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&vault.vault_seeds()]),
        amount,
    )?;

    // update the gdr
    let gdr = &mut *ctx.accounts.gem_deposit_receipt;
    let gem_box = &ctx.accounts.gem_box;

    gdr.gem_count.try_sub_assign(amount)?;

    // this check is semi-useless but won't hurt
    if gdr.gem_count != gem_box.amount.try_sub(amount)? {
        return Err(error!(ErrorCode::AmountMismatch));
    }

    // if gembox empty, close both the box and the GDR, and return funds to user
    if gdr.gem_count == 0 {
        // close gem box
        token::close_account(
            ctx.accounts
                .close_context()
                .with_signer(&[&vault.vault_seeds()]),
        )?;

        // close GDR
        let receiver = &mut ctx.accounts.receiver;
        let gdr = &mut (*ctx.accounts.gem_deposit_receipt).to_account_info();

        close_account(gdr, receiver)?;

        // decrement gem box count stored in vault's state
        let vault = &mut ctx.accounts.vault;
        vault.gem_box_count.try_sub_assign(1)?;
    }

    // decrement gem count as well
    let vault = &mut ctx.accounts.vault;
    vault.gem_count.try_sub_assign(amount)?;
    vault
        .rarity_points
        .try_sub_assign(calc_rarity_points(&ctx.accounts.gem_rarity, amount)?)?;

    //msg!("{} gems withdrawn from ${} gem box", amount, gem_box.key());
    Ok(())
}
