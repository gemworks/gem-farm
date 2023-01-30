use std::slice::Iter;

use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use arrayref::array_ref;
use gem_common::{errors::ErrorCode, *};

use crate::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_rarity: u8)]
pub struct DepositGemPnft<'info> {
    // bank
    pub bank: Box<Account<'info, Bank>>,

    // vault
    // skipped vault PDA verification because requires passing in creator, which is tedious
    // sec wise secure enough: vault has owner -> owner is signer
    #[account(mut, has_one = bank, has_one = owner, has_one = authority)]
    pub vault: Box<Account<'info, Vault>>,
    // currently only the vault owner can deposit
    // add a "depositor" account, and remove Signer from vault owner to let anyone to deposit
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK:
    #[account(seeds = [vault.key().as_ref()], bump = bump_auth)]
    pub authority: AccountInfo<'info>,

    // gem
    #[account(init_if_needed, seeds = [
            b"gem_box".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump,
        token::mint = gem_mint,
        token::authority = authority,
        payer = owner)]
    pub gem_box: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, seeds = [
            b"gem_deposit_receipt".as_ref(),
            vault.key().as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump,
        payer = owner,
        space = 8 + std::mem::size_of::<GemDepositReceipt>())]
    pub gem_deposit_receipt: Box<Account<'info, GemDepositReceipt>>,
    #[account(mut)]
    pub gem_source: Box<Account<'info, TokenAccount>>,
    pub gem_mint: Box<Account<'info, Mint>>,
    // we MUST ask for this PDA both during deposit and withdrawal for sec reasons, even if it's zero'ed
    /// CHECK:
    #[account(seeds = [
            b"gem_rarity".as_ref(),
            bank.key().as_ref(),
            gem_mint.key().as_ref()
        ],
        bump = bump_rarity)]
    pub gem_rarity: AccountInfo<'info>,

    // misc
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,

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
            gem_source.key().as_ref()
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
            gem_box.key().as_ref()
        ],
        seeds::program = mpl_token_metadata::id(),
        bump
    )]
    pub dest_token_record: UncheckedAccount<'info>,
    pub pnft_shared: ProgNftShared<'info>,
    //
    // remaining accounts could be passed, in this order:
    // - rules account
    // - mint_whitelist_proof
    // - creator_whitelist_proof
}

fn assert_valid_whitelist_proof<'info>(
    whitelist_proof: &AccountInfo<'info>,
    bank: &Pubkey,
    address_to_whitelist: &Pubkey,
    program_id: &Pubkey,
    expected_whitelist_type: WhitelistType,
) -> Result<()> {
    // 1 verify the PDA seeds match
    let seed = &[
        b"whitelist".as_ref(),
        bank.as_ref(),
        address_to_whitelist.as_ref(),
    ];
    let (whitelist_addr, _bump) = Pubkey::find_program_address(seed, program_id);

    // we can't use an assert_eq statement, we want to catch this error and continue along to creator testing
    if whitelist_addr != whitelist_proof.key() {
        return Err(error!(ErrorCode::NotWhitelisted));
    }

    // 2 no need to verify ownership, deserialization does that for us
    // https://github.com/project-serum/anchor/blob/fcb07eb8c3c9355f3cabc00afa4faa6247ccc960/lang/src/account.rs#L36
    let proof = Account::<'info, WhitelistProof>::try_from(whitelist_proof)?;

    // 3 verify whitelist type matches
    proof.contains_type(expected_whitelist_type)
}

fn assert_whitelisted<'info>(
    ctx: &Context<DepositGemPnft<'info>>,
    remaining_accs: &mut Iter<AccountInfo<'info>>,
) -> Result<()> {
    let bank = &*ctx.accounts.bank;
    let mint = &*ctx.accounts.gem_mint;

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
            // msg!("mint whitelisted: {}, going ahead", &mint.key());
            return Ok(());
        }
    }

    // if mint verification above failed, attempt to verify based on creator
    if bank.whitelisted_creators > 0 {
        let creator_whitelist_proof_info = next_account_info(remaining_accs)?;

        //here metadata passed in as a fixed account
        let metadata = assert_decode_metadata(&mint, &ctx.accounts.gem_metadata)?;

        // metaplex constraints this to max 5, so won't go crazy on compute
        // (empirical testing showed there's practically 0 diff between stopping at 0th and 5th creator)
        for creator in &metadata.data.creators.unwrap() {
            // verify creator actually signed off on this nft
            if !creator.verified {
                continue;
            }

            // check if creator is whitelisted, returns an error if not
            let attempted_proof = assert_valid_whitelist_proof(
                creator_whitelist_proof_info,
                &bank.key(),
                &creator.address,
                ctx.program_id,
                WhitelistType::CREATOR,
            );

            match attempted_proof {
                //proof succeeded, return out of the function, no need to continue looping
                Ok(()) => return Ok(()),
                //proof failed, continue to check next creator
                Err(_e) => continue,
            }
        }
    }

    // if both conditions above failed tok return Ok(()), then verification failed
    Err(error!(ErrorCode::NotWhitelisted))
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, DepositGemPnft<'info>>,
    amount: u64,
    authorization_data: Option<AuthorizationDataLocal>,
    rules_acc_present: bool,
) -> Result<()> {
    // do the transfer
    let rem_acc = &mut ctx.remaining_accounts.iter();
    let auth_rules = if rules_acc_present {
        Some(next_account_info(rem_acc)?)
    } else {
        None
    };
    send_pnft(
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.gem_source,
        &ctx.accounts.gem_box,
        &ctx.accounts.authority.to_account_info(),
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
        None,
    )?;

    // fix missing discriminator check
    {
        let acct = ctx.accounts.gem_deposit_receipt.to_account_info();
        let data: &[u8] = &acct.try_borrow_data()?;
        let disc_bytes = array_ref![data, 0, 8];
        if disc_bytes != &GemDepositReceipt::discriminator() && disc_bytes.iter().any(|a| a != &0) {
            return Err(error!(ErrorCode::AccountDiscriminatorMismatch));
        }
    }

    // if even a single whitelist exists, verify the token against it
    let bank = &*ctx.accounts.bank;

    if bank.whitelisted_mints > 0 || bank.whitelisted_creators > 0 {
        assert_whitelisted(&ctx, rem_acc)?;
    }

    // verify vault not suspended
    let bank = &*ctx.accounts.bank;
    let vault = &ctx.accounts.vault;

    if vault.access_suspended(bank.flags)? {
        return Err(error!(ErrorCode::VaultAccessSuspended));
    }

    // record total number of gem boxes in vault's state
    let vault = &mut ctx.accounts.vault;
    vault.gem_box_count.try_add_assign(1)?;
    vault.gem_count.try_add_assign(amount)?;
    vault
        .rarity_points
        .try_add_assign(calc_rarity_points(&ctx.accounts.gem_rarity, amount)?)?;

    // record a gdr
    let gdr = &mut *ctx.accounts.gem_deposit_receipt;
    let gem_box = &*ctx.accounts.gem_box;

    gdr.vault = vault.key();
    gdr.gem_box_address = gem_box.key();
    gdr.gem_mint = gem_box.mint;
    gdr.gem_count.try_add_assign(amount)?;

    // this check is semi-useless but won't hurt
    if gdr.gem_count != gem_box.amount.try_add(amount)? {
        // msg!("{} {}", gdr.gem_count, gem_box.amount);
        return Err(error!(ErrorCode::AmountMismatch));
    }

    // msg!("{} gems deposited into {} gem box", amount, gem_box.key());
    Ok(())
}
