use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use anchor_lang::solana_program::sysvar::Sysvar;
use gem_common::errors::ErrorCode;
use gem_common::*;
use std::cell::RefMut;
use std::convert::TryInto;

// todo factor in precision later
const PRECISION: u128 = u64::MAX as u128;

pub fn update_accrued_rewards(
    farm: &mut Account<Farm>,
    mut farmer: Option<&mut Account<Farmer>>,
) -> ProgramResult {
    let now_ts = now_ts()?;

    // reward a
    let (farmer_gems_staked, farmer_reward_a) = match farmer {
        Some(ref mut farmer) => (Some(farmer.gems_staked), Some(&mut farmer.reward_a)),
        None => (None, None),
    };

    update_single_reward_type(
        now_ts,
        farm.rewards_last_updated_ts,
        farm.gems_staked,
        &mut farm.reward_a,
        farmer_gems_staked,
        farmer_reward_a,
    )?;

    // reward b
    let farmer_reward_b = match farmer {
        Some(ref mut farmer) => Some(&mut farmer.reward_b),
        None => None,
    };

    update_single_reward_type(
        now_ts,
        farm.rewards_last_updated_ts,
        farm.gems_staked,
        &mut farm.reward_b,
        farmer_gems_staked,
        farmer_reward_b,
    )?;

    farm.rewards_last_updated_ts = now_ts;

    Ok(())
}

// --------------------------------------- private

fn update_single_reward_type(
    now_ts: u64,
    rewards_last_updated_ts: u64,
    farm_gems_staked: u64,
    farm_reward: &mut FarmRewardTracker,
    farmer_gems_staked: Option<u64>,
    farmer_reward: Option<&mut FarmerRewardTracker>,
) -> ProgramResult {
    let reward_upper_bound_ts = calc_reward_upper_bound(farm_reward.reward_end_ts, now_ts);

    let newly_accrued_reward_per_gem = calc_newly_accrued_reward(
        farm_reward,
        farm_gems_staked,
        reward_upper_bound_ts,
        rewards_last_updated_ts,
    )?;

    farm_reward
        .accrued_reward_per_gem
        .try_self_add(newly_accrued_reward_per_gem)?;

    if let Some(farmer_reward) = farmer_reward {
        let newly_accrued_reward_per_farmer =
            newly_accrued_reward_per_gem.try_mul(farmer_gems_staked.unwrap())?;

        farmer_reward
            .accrued_reward
            .try_self_add(newly_accrued_reward_per_farmer)?;
    }

    Ok(())
}

fn calc_newly_accrued_reward(
    farm_reward: &FarmRewardTracker,
    farm_gems_staked: u64,
    reward_upper_bound_ts: u64,
    rewards_last_updated_ts: u64,
) -> Result<u64, ProgramError> {
    // if no gems staked, return existing accrued reward
    if farm_gems_staked == 0 {
        return Ok(farm_reward.accrued_reward_per_gem);
    }

    // if no time has passed, return existing accrued reward
    if reward_upper_bound_ts <= rewards_last_updated_ts {
        return Ok(farm_reward.accrued_reward_per_gem);
    }

    let time_since_last_calc_sec = reward_upper_bound_ts.try_sub(rewards_last_updated_ts)?;

    time_since_last_calc_sec
        .try_mul(farm_reward.reward_rate)?
        .try_floor_div(farm_gems_staked)
}

fn calc_reward_upper_bound(reward_end_ts: u64, now: u64) -> u64 {
    std::cmp::min(now, reward_end_ts)
}
