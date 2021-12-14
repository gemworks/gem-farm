use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use anchor_lang::solana_program::sysvar::Sysvar;
use gem_common::errors::ErrorCode;
use gem_common::*;
use std::convert::TryInto;

// todo factor in precision later
const PRECISION: u128 = u64::MAX as u128;

pub fn update_accrued_rewards(
    farm: &mut Account<Farm>,
    farmer: Option<&mut Account<Farmer>>,
) -> ProgramResult {
    let clock = clock::Clock::get()?;

    let rewards_accrue_up_to_ts = calc_latest_applicable_reward_ts(
        farm.rewards_end_ts,
        clock.unix_timestamp.try_into().unwrap(), //i64 -> u64 is fine
    );

    let newly_accrued_rewards_per_gem = calc_newly_accrued_rewards(farm, rewards_accrue_up_to_ts)?;

    farm.accrued_rewards_per_gem
        .try_self_add(newly_accrued_rewards_per_gem);
    farm.rewards_last_updated_ts = rewards_accrue_up_to_ts;

    msg!("Rewards updated, Farm: {:?}", **farm);

    if let Some(farmer) = farmer {
        // need to do the multiplication here, because gems staked can vary over time
        let newly_accrued_rewards_total =
            newly_accrued_rewards_per_gem.try_mul(farmer.gems_staked)?;

        farmer
            .accrued_rewards_total
            .try_self_add(newly_accrued_rewards_total)?;

        msg!("Rewards updated, Farmer: {:?}", **farmer);
    }

    Ok(())
}

pub fn calc_newly_accrued_rewards(
    farm: &Account<Farm>,
    rewards_accrue_up_to_ts: u64,
) -> Result<u64, ProgramError> {
    // if no gems staked, simply return existing accrued reward
    if farm.gems_staked == 0 {
        return Ok(farm.accrued_rewards_per_gem);
    }

    let time_since_last_reward_calc_secs =
        rewards_accrue_up_to_ts.try_sub(farm.rewards_last_updated_ts)?;

    time_since_last_reward_calc_secs
        .try_mul(farm.reward_rate)?
        .try_floor_div(farm.gems_staked)
}

pub fn calc_latest_applicable_reward_ts(reward_duration_end: u64, now: u64) -> u64 {
    std::cmp::min(now, reward_duration_end)
}
