use anchor_lang::prelude::*;
use anchor_spl::token::accessor::mint;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use metaplex_token_metadata::state::Metadata;
use std::str::FromStr;

use crate::{errors::ErrorCode, state::*, utils::math::*};

#[derive(Accounts)]
#[instruction(bump_gem_box: u8, bump_gdr: u8, bump_metadata: u8)]
pub struct DepositGem<'info> {
    // needed for checking flags
    pub bank: Box<Account<'info, Bank>>,
    // needed for seeds derivation + we increment gem box count
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)]
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
        payer = depositor)]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed,
        seeds = [
            b"gem_deposit_receipt".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump_gdr,
        payer = depositor,
        space = 8 + std::mem::size_of::<GemDepositReceipt>())]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(mut)]
    pub gem_source: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    #[account(constraint = assert_valid_metadata(
        &gem_metadata,
        &gem_mint.key(),
        &metadata_program.key()))]
    pub gem_metadata: AccountInfo<'info>,
    #[account(mut)]
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    #[account(address = Pubkey::from_str("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").unwrap())]
    pub metadata_program: AccountInfo<'info>,
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

fn assert_valid_metadata(
    gem_metadata: &AccountInfo,
    gem_mint: &Pubkey,
    metadata_program: &Pubkey,
) -> bool {
    // 1 verify the owner of the account is metaplex's metadata program
    assert_eq!(gem_metadata.owner, metadata_program);

    // 2 verify the PDA seeds
    let metadata_seed = &[
        b"metadata".as_ref(),
        metadata_program.as_ref(),
        gem_mint.as_ref(),
    ];
    let (metadata_addr, _bump) = Pubkey::find_program_address(metadata_seed, &metadata_program);
    assert_eq!(metadata_addr, gem_metadata.key());

    true
}

// fn assert_whitelisted_nft(ctx: &Context<DepositGem>) -> ProgramResult {
//     // let bank = &*ctx.accounts.bank;
//     // let remaining_accs = &mut ctx.remaining_accounts.iter();
//     // let untrusted_metadata = next_account_info(remaining_accs)?;
//     //
//     // let base_seeds = [b"whitelist".as_ref(), bank.key().as_ref()];
//     //
//     // if bank.whitelisted_creators > 0 {}
//     //
//     // if bank.whitelisted_update_authorities > 0 {}
//
//     Ok(())
// }

fn assert_whitelisted(ctx: &Context<DepositGem>) -> ProgramResult {
    let bank = &*ctx.accounts.bank;
    let remaining_accs = &mut ctx.remaining_accounts.iter();
    let mint_whitelist_proof = next_account_info(remaining_accs)?;
    let creator_whitelist_proof = next_account_info(remaining_accs)?;
    let authority_whitelist_proof = next_account_info(remaining_accs)?;
    let metadata = next_account_info(remaining_accs)?;

    let base_seeds = [b"whitelist".as_ref(), bank.key().as_ref()];

    if bank.whitelisted_mints > 0 {
        let mut seeds = base_seeds.clone().to_vec();
        seeds.push(mint.key().as_ref());
        let whitelist_proof = Pubkey::find_program_address(seeds.as_slice(), ctx.program_id);
    }

    if bank.whitelisted_creators > 0 {}

    if bank.whitelisted_update_authorities > 0 {}

    Ok(())
}

// todo or vs and
pub fn handler(ctx: Context<DepositGem>, amount: u64) -> ProgramResult {
    // if a whitelist exists, verify token whitelisted
    let bank = &*ctx.accounts.bank;

    if bank.whitelisted_mints > 0
        || bank.whitelisted_creators > 0
        || bank.whitelisted_update_authorities > 0
    {
        assert_whitelisted(&ctx)?;
    }

    let m = Metadata::from_account_info(&ctx.accounts.gem_metadata)?;

    // verify vault not suspended
    let bank = &*ctx.accounts.bank;
    let vault = &ctx.accounts.vault;

    if vault.access_suspended(bank.flags)? {
        return Err(ErrorCode::VaultAccessSuspended.into());
    }

    // do the transfer
    token::transfer(
        ctx.accounts
            .transfer_ctx()
            .with_signer(&[&vault.vault_seeds()]),
        amount,
    )?;

    // record total number of gem boxes in vault's state
    let vault = &mut ctx.accounts.vault;
    vault.gem_box_count.try_self_add(1)?;

    // record a gdr
    let gdr = &mut *ctx.accounts.gem_deposit_receipt;
    let gem_box = &*ctx.accounts.gem_box;

    gdr.vault = vault.key();
    gdr.gem_box_address = gem_box.key();
    gdr.gem_mint = gem_box.mint;
    gdr.gem_amount.try_self_add(amount)?;

    // this check is semi-useless but won't hurt
    if gdr.gem_amount != gem_box.amount + amount {
        return Err(ErrorCode::AmountMismatch.into());
    }

    msg!("{} gems deposited into ${} gem box", amount, gem_box.key());
    Ok(())
}
