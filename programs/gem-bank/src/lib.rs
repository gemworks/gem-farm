use anchor_lang::prelude::*;
use instructions::*;

declare_id!("4bctEZztjcDVUi1WgqYKDJ4LirBKhvg2aS9kDeaFfYbR");

pub mod errors;
pub mod instructions;
pub mod state;
pub mod util;

#[program]
pub mod gem_bank {
    use super::*;
    use crate::errors::ErrorCode;

    pub fn init_bank(ctx: Context<InitBank>) -> ProgramResult {
        instructions::init_bank::handler(ctx)
    }

    pub fn init_vault(ctx: Context<InitVault>, _bump: u8, authority: Pubkey) -> ProgramResult {
        instructions::init_vault::handler(ctx, authority)
    }

    pub fn set_bank_flags(ctx: Context<SetBankFlags>, flags: u64) -> ProgramResult {
        instructions::set_bank_flags::handler(ctx, flags)
    }

    pub fn update_vault_authority(
        ctx: Context<UpdateVaultAuthority>,
        new_authority: Pubkey,
    ) -> ProgramResult {
        instructions::update_vault_authority::handler(ctx, new_authority)
    }
}
