//! (!) a decision was made to go with the approach of recording rarities PER BANK
//!
//! an alternative would be to record rarities PER COLLECTION
//! then we'd only allow the update_authority recorded on the Metadata to store rarity scores
//!
//! Pros of chosen approach:
//! - flexibility: if update_authority Keypair is lost, a collection would never be able to run a bank with rarities
//! - speed/ux: less computation needs to happen on-chain, hence can fit in more record ixs per tx
//! - full reliance on bank manager: bank manager can offer rewards for someone else's collection,
//!   using their own rarity set, without asking for permission
//!
//! Cons:
//! - if 2 banks are started, even by the same manager, the rarity PDAs will have to be recorded twice
//!   this means fees to record them (10 sol for 10k collection) will have to be paid twice

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction::create_account;

use crate::state::*;

#[derive(Accounts)]
pub struct RecordRarityPoints<'info> {
    // bank
    #[account(has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    pub bank_manager: Signer<'info>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    //
    // remaining accounts can be any number of:
    //   pub gem_mint: Box<Account<'info, Mint>>,
    //   #[account(mut)]
    //   pub gem_rarity: Box<Account<'info, Rarity>>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, RecordRarityPoints<'info>>,
    rarity_configs: Vec<RarityConfig>,
) -> Result<()> {
    let remaining_accs = &mut ctx.remaining_accounts.iter();

    // the limiting factor here is actually not compute budget, but tx size client-side
    for config in rarity_configs.iter() {
        let gem_mint = next_account_info(remaining_accs)?;
        let gem_rarity = next_account_info(remaining_accs)?;

        // find bump - doing this program-side to reduce amount of info to be passed in (tx size)
        let (_pk, bump) = Pubkey::find_program_address(
            &[
                b"gem_rarity".as_ref(),
                ctx.accounts.bank.key().as_ref(),
                gem_mint.key().as_ref(),
            ],
            ctx.program_id,
        );

        // create the PDA if doesn't exist
        if gem_rarity.data_is_empty() {
            create_pda_with_space(
                &[
                    b"gem_rarity".as_ref(),
                    ctx.accounts.bank.key().as_ref(),
                    gem_mint.key().as_ref(),
                    &[bump],
                ],
                gem_rarity,
                8 + std::mem::size_of::<Rarity>(),
                ctx.program_id,
                &ctx.accounts.payer.to_account_info(),
                &ctx.accounts.system_program.to_account_info(),
            )?;
        }

        let disc = hash("account:Rarity".as_bytes());

        let mut gem_rarity_raw = gem_rarity.data.borrow_mut();
        gem_rarity_raw[..8].clone_from_slice(&disc.to_bytes()[..8]);
        gem_rarity_raw[8..10].clone_from_slice(&config.rarity_points.to_le_bytes());
    }

    Ok(())
}

// try to make this as small as possible, to fit in max # of txs
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq)]
pub struct RarityConfig {
    pub mint: Pubkey,
    pub rarity_points: u16,
}

fn create_pda_with_space<'info>(
    pda_seeds: &[&[u8]],
    pda_info: &AccountInfo<'info>,
    space: usize,
    owner: &Pubkey,
    funder_info: &AccountInfo<'info>,
    system_program_info: &AccountInfo<'info>,
) -> Result<()> {
    //create a PDA and allocate space inside of it at the same time
    //can only be done from INSIDE the program
    //based on https://github.com/solana-labs/solana-program-library/blob/7c8e65292a6ebc90de54468c665e30bc590c513a/feature-proposal/program/src/processor.rs#L148-L163
    invoke_signed(
        &create_account(
            &funder_info.key,
            &pda_info.key,
            1.max(Rent::get()?.minimum_balance(space)),
            space as u64,
            owner,
        ),
        &[
            funder_info.clone(),
            pda_info.clone(),
            system_program_info.clone(),
        ],
        &[pda_seeds], //this is the part you can't do outside the program
    )
    .map_err(Into::into)
}
