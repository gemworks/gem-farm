use anchor_lang::prelude::*;
use instructions::*;

declare_id!("5f8w4vbj1CkUBtiZa5k18AjP4R6Qi63pkruDD5xRZwVT");

pub mod instructions;
pub mod rewards;
pub mod state;

#[program]
pub mod gem_farm {
    use super::*;

    pub fn init_farm(ctx: Context<InitFarm>, bump: u8) -> ProgramResult {
        instructions::init_farm::handler(ctx, bump)
    }

    pub fn init_farmer(
        ctx: Context<InitFarmer>,
        _bump_farmer: u8,
        bump_vault: u8,
    ) -> ProgramResult {
        instructions::init_farmer::handler(ctx, bump_vault)
    }

    pub fn stake(ctx: Context<Stake>, _bump: u8) -> ProgramResult {
        instructions::stake::handler(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>) -> ProgramResult {
        instructions::unstake::handler(ctx)
    }

    pub fn add_funder(ctx: Context<AddFunder>) -> ProgramResult {
        instructions::add_funder::handler(ctx)
    }

    pub fn remove_funder(ctx: Context<RemoveFunder>) -> ProgramResult {
        instructions::remove_funder::handler(ctx)
    }

    pub fn fund(ctx: Context<Fund>) -> ProgramResult {
        instructions::fund::handler(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> ProgramResult {
        instructions::claim::handler(ctx)
    }
}
