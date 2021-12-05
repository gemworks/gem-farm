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

    pub fn init_bank(ctx: Context<InitBank>) -> ProgramResult {
        instructions::init_bank::handler(ctx)
    }

    pub fn set_bank_flags(ctx: Context<SetBankFlags>, flags: u64) -> ProgramResult {
        instructions::set_bank_flags::handler(ctx, flags)
    }

    pub fn init_vault(ctx: Context<InitVault>, _bump: u8, owner: Pubkey) -> ProgramResult {
        instructions::init_vault::handler(ctx, owner)
    }

    pub fn lock_vault(ctx: Context<LockVault>) -> ProgramResult {
        instructions::lock_vault::handler(ctx)
    }

    pub fn unlock_vault(ctx: Context<UnlockVault>) -> ProgramResult {
        instructions::unlock_vault::handler(ctx)
    }

    pub fn update_vault_owner(ctx: Context<UpdateVaultOwner>, new_owner: Pubkey) -> ProgramResult {
        instructions::update_vault_owner::handler(ctx, new_owner)
    }

    pub fn deposit_gem(ctx: Context<DepositGem>, _bump: u8, amount: u64) -> ProgramResult {
        instructions::deposit_gem::handler(ctx, amount)
    }

    pub fn withdraw_gem(ctx: Context<WithdrawGem>, amount: u64) -> ProgramResult {
        instructions::withdraw_gem::handler(ctx, amount)
    }
}
