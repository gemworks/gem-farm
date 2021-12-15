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
    let now_ts: u64 = clock::Clock::get()?.unix_timestamp.try_into().unwrap();

    let rewards_upper_bound_ts = calc_rewards_upper_bound(farm.rewards_end_ts, now_ts);

    let newly_accrued_rewards_per_gem = calc_newly_accrued_rewards(farm, rewards_upper_bound_ts)?;

    msg!(
        "newly accrued rewards per gem: {}",
        newly_accrued_rewards_per_gem
    );

    farm.accrued_rewards_per_gem
        .try_self_add(newly_accrued_rewards_per_gem)?;
    farm.rewards_last_updated_ts = rewards_upper_bound_ts;

    msg!("Rewards updated, Farm: {:?}", **farm);

    if let Some(farmer) = farmer {
        let newly_accrued_rewards_per_farmer =
            newly_accrued_rewards_per_gem.try_mul(farmer.gems_staked)?;

        farmer
            .accrued_rewards_total
            .try_self_add(newly_accrued_rewards_per_farmer)?;

        msg!("Rewards updated, Farmer: {:?}", **farmer);
    }

    Ok(())
}

pub fn calc_newly_accrued_rewards(
    farm: &Account<Farm>,
    rewards_upper_bound_ts: u64,
) -> Result<u64, ProgramError> {
    // if no gems staked, return existing accrued reward
    if farm.gems_staked == 0 {
        return Ok(farm.accrued_rewards_per_gem);
    }

    // if no time has passed, return existing accrued reward
    if rewards_upper_bound_ts <= farm.rewards_last_updated_ts {
        return Ok(farm.accrued_rewards_per_gem);
    }

    let time_since_last_calc_sec = rewards_upper_bound_ts.try_sub(farm.rewards_last_updated_ts)?;

    time_since_last_calc_sec
        .try_mul(farm.rewards_rate)?
        .try_floor_div(farm.gems_staked)
}

pub fn calc_rewards_upper_bound(rewards_end_ts: u64, now: u64) -> u64 {
    std::cmp::min(now, rewards_end_ts)
}

pub fn post_new_rewards(
    farm: &mut Account<Farm>,
    new_amount: u64,
    new_duration_sec: u64,
) -> ProgramResult {
    let now_ts: u64 = clock::Clock::get()?.unix_timestamp.try_into().unwrap();

    // if previous rewards have been exhausted
    if now_ts > farm.rewards_end_ts {
        farm.rewards_rate = new_amount.try_floor_div(new_duration_sec)?;
    // else if previous rewards are still active, we need to merge the two
    } else {
        let remaining_duration_sec = farm.rewards_end_ts.try_sub(now_ts)?;
        let remaining_amount = remaining_duration_sec.try_mul(farm.rewards_rate)?;

        farm.rewards_rate = new_amount
            .try_add(remaining_amount)?
            .try_floor_div(new_duration_sec)?;
    }

    // to have a clean calc going forward
    farm.rewards_last_updated_ts = now_ts;
    farm.rewards_duration_sec = new_duration_sec;
    farm.rewards_end_ts = now_ts.try_add(new_duration_sec)?;

    Ok(())
}
