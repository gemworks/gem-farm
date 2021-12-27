use anchor_lang::prelude::*;
use instructions::*;
use state::*;

pub mod instructions;
pub mod number128;
pub mod state;

declare_id!("2VMTQBkVcwaYj2VJH1EB1hSa8bv8Dij5sCEtfWJMoFGK");

#[program]
pub mod gem_farm {
    use super::*;

    // --------------------------------------- core

    pub fn init_farm(
        ctx: Context<InitFarm>,
        bump_auth: u8,
        _bump_treasury: u8,
        _bump_pot_a: u8,
        _bump_pot_b: u8,
        reward_type_a: RewardType,
        reward_type_b: RewardType,
        farm_config: FarmConfig,
    ) -> ProgramResult {
        msg!("init farm");
        instructions::init_farm::handler(ctx, bump_auth, reward_type_a, reward_type_b, farm_config)
    }

    pub fn payout_from_treasury(
        ctx: Context<TreasuryPayout>,
        bump: u8,
        lamports: u64,
    ) -> ProgramResult {
        msg!("payout");
        instructions::treasury_payout::handler(ctx, bump, lamports)
    }

    // --------------------------------------- farmer ops

    pub fn init_farmer(
        ctx: Context<InitFarmer>,
        _bump_farmer: u8,
        bump_vault: u8,
    ) -> ProgramResult {
        msg!("init farmer");
        instructions::init_farmer::handler(ctx, bump_vault)
    }

    pub fn stake(ctx: Context<Stake>, _bump: u8) -> ProgramResult {
        msg!("stake");
        instructions::stake::handler(ctx)
    }

    pub fn unstake(ctx: Context<Unstake>, _bump_treasury: u8, _bump_farmer: u8) -> ProgramResult {
        msg!("unstake");
        instructions::unstake::handler(ctx)
    }

    pub fn claim(
        ctx: Context<Claim>,
        _bump_auth: u8,
        _bump_farmer: u8,
        _bump_pot_a: u8,
        _bump_pot_b: u8,
    ) -> ProgramResult {
        msg!("claim");
        instructions::claim::handler(ctx)
    }

    pub fn flash_deposit(
        ctx: Context<FlashDeposit>,
        _bump_farmer: u8,
        bump_gem_box: u8,
        bump_gdr: u8,
        amount: u64,
    ) -> ProgramResult {
        msg!("flash deposit");
        instructions::flash_deposit::handler(ctx, bump_gem_box, bump_gdr, amount)
    }

    pub fn refresh_farmer(ctx: Context<RefreshFarmer>, _bump: u8) -> ProgramResult {
        msg!("refresh farmer");
        instructions::refresh_farmer::handler(ctx)
    }

    // --------------------------------------- funder ops

    pub fn authorize_funder(ctx: Context<AuthorizeFunder>, _bump: u8) -> ProgramResult {
        msg!("authorize funder");
        instructions::authorize_funder::handler(ctx)
    }

    pub fn deauthorize_funder(ctx: Context<DeauthorizeFunder>, _bump: u8) -> ProgramResult {
        msg!("feauthorize funder");
        instructions::deauthorize_funder::handler(ctx)
    }

    // --------------------------------------- reward ops

    pub fn fund_reward(
        ctx: Context<FundReward>,
        _bump_proof: u8,
        _bump_pot: u8,
        variable_rate_config: Option<VariableRateConfig>,
        fixed_rate_config: Option<FixedRateConfig>,
    ) -> ProgramResult {
        msg!("fund reward");
        instructions::fund_reward::handler(ctx, variable_rate_config, fixed_rate_config)
    }

    pub fn cancel_reward(
        ctx: Context<CancelReward>,
        _bump_auth: u8,
        _bump_pot: u8,
    ) -> ProgramResult {
        msg!("cancel reward");
        instructions::cancel_reward::handler(ctx)
    }

    pub fn lock_reward(ctx: Context<LockReward>) -> ProgramResult {
        msg!("lock reward");
        instructions::lock_reward::handler(ctx)
    }
}
