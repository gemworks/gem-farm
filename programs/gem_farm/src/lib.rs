use anchor_lang::prelude::*;
use instructions::*;

declare_id!("5f8w4vbj1CkUBtiZa5k18AjP4R6Qi63pkruDD5xRZwVT");

pub mod instructions;
pub mod rewards;
pub mod state;

#[program]
pub mod gem_farm {
    use super::*;

    pub fn init_farm(
        ctx: Context<InitFarm>,
        bump_auth: u8,
        _bump_pot_a: u8,
        _bump_pot_b: u8,
    ) -> ProgramResult {
        instructions::init_farm::handler(ctx, bump_auth)
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

    pub fn unstake(ctx: Context<Unstake>, _bump: u8) -> ProgramResult {
        instructions::unstake::handler(ctx)
    }

    pub fn authorize_funder(ctx: Context<AuthorizeFunder>, _bump: u8) -> ProgramResult {
        instructions::authorize_funder::handler(ctx)
    }

    pub fn deauthorize_funder(ctx: Context<DeauthorizeFunder>) -> ProgramResult {
        instructions::deauthorize_funder::handler(ctx)
    }

    pub fn fund(
        ctx: Context<Fund>,
        _bump_proof: u8,
        _bump_pot: u8,
        amount: u64,
        duration_sec: u64,
    ) -> ProgramResult {
        instructions::fund::handler(ctx, amount, duration_sec)
    }

    pub fn claim(ctx: Context<Claim>) -> ProgramResult {
        instructions::claim::handler(ctx)
    }
}
