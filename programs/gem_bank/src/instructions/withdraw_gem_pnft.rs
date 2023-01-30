use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount},
};
use gem_common::{errors::ErrorCode, *};

use crate::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_gem_box: u8, bump_gdr: u8, bump_rarity: u8)]
pub struct WithdrawGemPnft<'info> {
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

    // pfnt
    //can't deserialize directly coz Anchor traits not implemented
    /// CHECK: assert_decode_metadata + seeds below
    #[account(
        mut,
        seeds=[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            mpl_token_metadata::id().as_ref(),
            gem_mint.key().as_ref(),
        ],
        seeds::program = mpl_token_metadata::id(),
        bump
    )]
    pub gem_metadata: UncheckedAccount<'info>,

    //note that MASTER EDITION and EDITION share the same seeds, and so it's valid to check them here
    /// CHECK: seeds below
    #[account(
        seeds=[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            mpl_token_metadata::id().as_ref(),
            gem_mint.key().as_ref(),
            mpl_token_metadata::state::EDITION.as_bytes(),
        ],
        seeds::program = mpl_token_metadata::id(),
        bump
    )]
    pub gem_edition: UncheckedAccount<'info>,

    /// CHECK: seeds below
    #[account(mut,
        seeds=[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            mpl_token_metadata::id().as_ref(),
            gem_mint.key().as_ref(),
            mpl_token_metadata::state::TOKEN_RECORD_SEED.as_bytes(),
            gem_box.key().as_ref()
        ],
        seeds::program = mpl_token_metadata::id(),
        bump
    )]
    pub owner_token_record: UncheckedAccount<'info>,

    /// CHECK: seeds below
    #[account(mut,
        seeds=[
            mpl_token_metadata::state::PREFIX.as_bytes(),
            mpl_token_metadata::id().as_ref(),
            gem_mint.key().as_ref(),
            mpl_token_metadata::state::TOKEN_RECORD_SEED.as_bytes(),
            gem_destination.key().as_ref()
        ],
        seeds::program = mpl_token_metadata::id(),
        bump
    )]
    pub dest_token_record: UncheckedAccount<'info>,
    pub pnft_shared: ProgNftShared<'info>,
}

impl<'info> WithdrawGemPnft<'info> {
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

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, WithdrawGemPnft<'info>>,
    amount: u64,
    authorization_data: Option<AuthorizationDataLocal>,
    rules_acc_present: bool,
) -> Result<()> {
    // verify vault not suspended
    let bank = &*ctx.accounts.bank;
    let vault = &ctx.accounts.vault;

    if vault.access_suspended(bank.flags)? {
        return Err(error!(ErrorCode::VaultAccessSuspended));
    }

    // do the transfer
    let rem_acc = &mut ctx.remaining_accounts.iter();
    let auth_rules = if rules_acc_present {
        Some(next_account_info(rem_acc)?)
    } else {
        None
    };
    send_pnft(
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.gem_box,
        &ctx.accounts.gem_destination,
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.gem_mint,
        &ctx.accounts.gem_metadata,
        &ctx.accounts.gem_edition,
        &ctx.accounts.system_program,
        &ctx.accounts.token_program,
        &ctx.accounts.associated_token_program,
        &ctx.accounts.pnft_shared.instructions,
        &ctx.accounts.owner_token_record,
        &ctx.accounts.dest_token_record,
        &ctx.accounts.pnft_shared.authorization_rules_program,
        auth_rules,
        authorization_data,
        Some(&ctx.accounts.vault),
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
