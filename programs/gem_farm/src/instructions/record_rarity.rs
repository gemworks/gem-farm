pub use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
pub use gem_common::errors::*;
pub use gem_common::*;
use metaplex_token_metadata::state::Metadata;

pub use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct RecordRarity<'info> {
    // core
    pub gem_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, seeds = [
            b"gem_rarity".as_ref(),
            gem_mint.key().as_ref(),
        ],
        bump = bump,
        payer = payer,
        space = 8 + std::mem::size_of::<Rarity>())]
    pub gem_rarity: Box<Account<'info, Rarity>>,

    // metaplex
    pub gem_metadata: AccountInfo<'info>,
    pub gem_update_authority: Signer<'info>,

    // misc
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl RecordRarity<'_> {
    // todo alternative options here would be to make this farm specific, and only verify farm manager
    fn assert_valid_update_authority(&self) -> ProgramResult {
        let metadata = Metadata::from_account_info(&self.gem_metadata)?;

        // first make sure that metadata acc passed is actually for the correct mint
        require!(
            metadata.mint == self.gem_mint.key(),
            ErrorCode::WrongMetadata
        );

        // next make sure update authority matches
        require!(
            metadata.update_authority == self.gem_update_authority.key(),
            ErrorCode::WrongUpdateAuthority
        );

        Ok(())
    }
}

pub fn handler(ctx: Context<RecordRarity>, rarity_points: u16) -> ProgramResult {
    ctx.accounts.assert_valid_update_authority()?;

    let gem_rarity = &mut ctx.accounts.gem_rarity;

    gem_rarity.points = rarity_points;

    Ok(())
}
