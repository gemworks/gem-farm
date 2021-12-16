use crate::state::RewardType;
use anchor_lang::prelude::*;
use instructions::*;

pub mod instructions;
pub mod state;

declare_id!("5f8w4vbj1CkUBtiZa5k18AjP4R6Qi63pkruDD5xRZwVT");

#[program]
pub mod gem_farm {
    use super::*;

    pub fn init_farm(
        ctx: Context<InitFarm>,
        bump_auth: u8,
        _bump_pot_a: u8,
        _bump_pot_b: u8,
        reward_type_a: RewardType,
        reward_type_b: RewardType,
    ) -> ProgramResult {
        instructions::init_farm::handler(ctx, bump_auth, reward_type_a, reward_type_b)
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

    pub fn deauthorize_funder(ctx: Context<DeauthorizeFunder>, _bump: u8) -> ProgramResult {
        instructions::deauthorize_funder::handler(ctx)
    }

    pub fn fund(
        ctx: Context<Fund>,
        _bump_proof: u8,
        _bump_fr: u8,
        _bump_pot: u8,
        amount: u64,
        duration_sec: u64,
    ) -> ProgramResult {
        instructions::fund::handler(ctx, amount, duration_sec)
    }

    pub fn defund(
        ctx: Context<Defund>,
        _bump_proof: u8,
        _bump_fr: u8,
        _bump_pot: u8,
        desired_amount: u64,
        new_duration_sec: Option<u64>,
    ) -> ProgramResult {
        instructions::defund::handler(ctx, desired_amount, new_duration_sec)
    }

    pub fn lock_funding(ctx: Context<LockFunding>) -> ProgramResult {
        instructions::lock_funding::handler(ctx)
    }

    pub fn claim(
        ctx: Context<Claim>,
        _bump_auth: u8,
        _bump_farmer: u8,
        _bump_pot_a: u8,
        _bump_pot_b: u8,
    ) -> ProgramResult {
        instructions::claim::handler(ctx)
    }
}
