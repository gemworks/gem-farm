use anchor_lang::prelude::*;
use instructions::*;
use state::*;

declare_id!("4bctEZztjcDVUi1WgqYKDJ4LirBKhvg2aS9kDeaFfYbR");

pub mod errors;
pub mod instructions;
pub mod state;
pub mod util;

#[program]
pub mod gem_bank {
    use super::*;

    pub fn init_keepr(ctx: Context<InitKeepr>, config: KeeprConfig) -> ProgramResult {
        instructions::init_keepr::handler(ctx, config)
    }

    pub fn init_vault(ctx: Context<InitVault>, _bump: u8) -> ProgramResult {
        instructions::init_vault::handler(ctx)
    }
}
