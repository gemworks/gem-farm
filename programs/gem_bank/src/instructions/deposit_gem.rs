use std::convert::TryFrom;
use std::str::FromStr;

use anchor_lang::prelude::*;
use anchor_spl::token::accessor::mint;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use gem_common::errors::ErrorCode;
use gem_common::*;
use metaplex_token_metadata::state::Metadata;

use crate::state::*;

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

fn assert_valid_metadata(
    gem_metadata: &AccountInfo,
    gem_mint: &Pubkey,
) -> Result<Metadata, ProgramError> {
    let metadata_program = Pubkey::from_str("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").unwrap();

    // 1 verify the owner of the account is metaplex's metadata program
    assert_eq!(gem_metadata.owner, &metadata_program);

    // 2 verify the PDA seeds match
    let seed = &[
        b"metadata".as_ref(),
        metadata_program.as_ref(),
        gem_mint.as_ref(),
    ];

    let (metadata_addr, _bump) = Pubkey::find_program_address(seed, &metadata_program);
    assert_eq!(metadata_addr, gem_metadata.key());

    Metadata::from_account_info(&gem_metadata)
}

fn assert_valid_whitelist_proof<'info>(
    whitelist_proof: &AccountInfo<'info>,
    bank: &Pubkey,
    address_to_whitelist: &Pubkey,
    program_id: &Pubkey,
    expected_whitelist_type: WhitelistType,
) -> ProgramResult {
    // 1 verify the PDA seeds match
    let seed = &[
        b"whitelist".as_ref(),
        bank.as_ref(),
        address_to_whitelist.as_ref(),
    ];
    let (whitelist_addr, _bump) = Pubkey::find_program_address(seed, program_id);

    // we can't use an assert_eq statement, we want to catch this error and continue along to creator testing
    if whitelist_addr != whitelist_proof.key() {
        return Err(ErrorCode::NotWhitelisted.into());
    }

    // 2 no need to verify ownership, deserialization does that for us
    // https://github.com/project-serum/anchor/blob/fcb07eb8c3c9355f3cabc00afa4faa6247ccc960/lang/src/account.rs#L36
    let proof = Account::<'info, WhitelistProof>::try_from(&whitelist_proof)?;

    // 3 verify whitelist type matches
    proof.contains_type(expected_whitelist_type)
}

fn assert_whitelisted(ctx: &Context<DepositGem>) -> ProgramResult {
    let bank = &*ctx.accounts.bank;
    let mint = &*ctx.accounts.gem_mint;
    let remaining_accs = &mut ctx.remaining_accounts.iter();

    // whitelisted mint is always the 1st optional account
    // this is because it's applicable to both NFTs and standard fungible tokens
    let mint_whitelist_proof_info = next_account_info(remaining_accs)?;

    // attempt to verify based on mint
    if bank.whitelisted_mints > 0 {
        if let Ok(()) = assert_valid_whitelist_proof(
            mint_whitelist_proof_info,
            &bank.key(),
            &mint.key(),
            ctx.program_id,
            WhitelistType::MINT,
        ) {
            msg!("mint whitelisted: {}, going ahead", &mint.key());
            return Ok(());
        }
    }

    // if mint verification above failed, attempt to verify based on creator
    if bank.whitelisted_creators > 0 {
        // 2 additional accounts are expected - metadata and creator whitelist proof
        let metadata_info = next_account_info(remaining_accs)?;
        let creator_whitelist_proof_info = next_account_info(remaining_accs)?;

        // verify metadata is legit
        let metadata = assert_valid_metadata(metadata_info, &mint.key())?;

        // metaplex constraints this to max 5, so won't go crazy on compute
        // (empirical testing showed there's practically 0 diff between stopping at 0th and 5th creator)
        for creator in &metadata.data.creators.unwrap() {
            // verify creator actually signed off on this nft
            if !creator.verified {
                continue;
            }

            return assert_valid_whitelist_proof(
                creator_whitelist_proof_info,
                &bank.key(),
                &creator.address,
                ctx.program_id,
                WhitelistType::CREATOR,
            );
        }
    }

    // if both conditions above failed tok return Ok(()), then verification failed
    Err(ErrorCode::NotWhitelisted.into())
}

pub fn handler(ctx: Context<DepositGem>, amount: u64) -> ProgramResult {
    // if even a single whitelist exists, verify the token against it
    let bank = &*ctx.accounts.bank;

    if bank.whitelisted_mints > 0 || bank.whitelisted_creators > 0 {
        assert_whitelisted(&ctx)?;
    }

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

    msg!("{} gems deposited into {} gem box", amount, gem_box.key());
    Ok(())
}
