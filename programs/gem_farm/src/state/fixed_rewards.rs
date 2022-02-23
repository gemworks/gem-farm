use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, *};

use crate::state::*;

#[proc_macros::assert_size(4)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum FixedRateRewardTier {
    Base,
    Tier1,
    Tier2,
    Tier3,
}

#[proc_macros::assert_size(16)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TierConfig {
    /// tokens/denominator/rarity point / sec
    pub reward_rate: u64,

    /// min amount of time that needs to pass for the above rate to come into effect
    pub required_tenure: u64,
}

#[proc_macros::assert_size(88)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateSchedule {
    /// tokens/denominator / sec
    pub base_rate: u64,

    pub tier1: Option<TierConfig>, //16 + 8 overhead

    pub tier2: Option<TierConfig>,

    pub tier3: Option<TierConfig>,

    /// needed to slow down the payout schedule (else min would be 1 token/rarity point/s or 86k/rarity point/day
    /// only used in fixed rate - in variable overall duration serves as sufficient speed regulator  
    pub denominator: u64,
}

/// custom impl coz need the discriminator to be 1 by default, else get div /0 errors
impl Default for FixedRateSchedule {
    fn default() -> Self {
        Self {
            base_rate: 0,
            tier1: None,
            tier2: None,
            tier3: None,
            denominator: 1,
        }
    }
}

#[proc_macros::assert_size(104)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateConfig {
    pub schedule: FixedRateSchedule,

    /// total amount that is being sent with the ix - will be added ON TOP of existing available funding
    pub amount: u64,

    /// duration the funding is being committed for
    /// eg if commit funding for 100s and a farmer shows up 3s in, they will be promised 97s at above schedule
    /// set this carefully!
    /// every farmer enrolled will be "reserved" an amount to cover the schedule for this duration
    pub duration_sec: u64,
}

/// a tenure which we can definitely apply the reward rate to
/// needed for calc only, not stored anywhere in final struct
#[repr(C)]
struct HeldTenure {
    definitive_start: u64,

    definitive_end: u64,

    reward_rate: u64,
}

impl HeldTenure {
    /// caps start and end, then saves a new HT
    fn new(
        reward_rate: u64,
        start_from: u64,
        end_at: u64,
        lower_bound: u64,
        upper_bound: u64,
    ) -> Option<Self> {
        let definitive_start = std::cmp::max(start_from, lower_bound);
        let definitive_end = std::cmp::min(end_at, upper_bound);

        match definitive_end < definitive_start {
            false => Some(Self {
                definitive_start,
                definitive_end,
                reward_rate,
            }),
            true => None,
        }
    }

    /// multiplies definitive start & end by the rate
    pub fn get_reward(&self) -> Result<u64> {
        let duration = self.definitive_end.try_sub(self.definitive_start)?;
        self.reward_rate.try_mul(duration)
    }
}

impl FixedRateSchedule {
    /// rates themselves can be anything, no invariant
    pub fn verify_schedule_invariants(&self) {
        if let Some(t3) = self.tier3 {
            // later tiers require earlier tiers to be present (no gaps)
            assert!(self.tier2.is_some() && self.tier1.is_some());

            // later tenures must be further into the future than earlier tenures
            let t2_tenure = self.tier2.unwrap().required_tenure;
            assert!(t3.required_tenure >= t2_tenure);

            let t1_tenure = self.tier1.unwrap().required_tenure;
            assert!(t2_tenure >= t1_tenure);
        };

        if let Some(t2) = self.tier2 {
            // later tiers require earlier tiers to be present (no gaps)
            assert!(self.tier1.is_some());

            // later tenures must be further into the future than earlier tenures
            let t1_tenure = self.tier1.unwrap().required_tenure;
            assert!(t2.required_tenure >= t1_tenure);
        };

        // denominator can't be 0
        assert_ne!(self.denominator, 0);
    }

    pub fn extract_tenure_and_rate(&self, tier: &str) -> Option<(u64, u64)> {
        match tier {
            "t1" => {
                if let Some(t) = self.tier1 {
                    Some((t.required_tenure, t.reward_rate))
                } else {
                    None
                }
            }
            "t2" => {
                if let Some(t) = self.tier2 {
                    Some((t.required_tenure, t.reward_rate))
                } else {
                    None
                }
            }
            "t3" => {
                if let Some(t) = self.tier3 {
                    Some((t.required_tenure, t.reward_rate))
                } else {
                    None
                }
            }
            _ => panic!("undefined tier"),
        }
    }

    pub fn get_base_reward(&self, start: u64, end: u64) -> Result<u64> {
        let duration = end.try_sub(start)?;
        self.base_rate.try_mul(duration)
    }

    /// extracts held tenure from a combination of
    ///   1) actual start & end times, and
    ///   2) appropriate lower/upper bounds
    /// lower bound: required_tenure extracted from appropriate TierConfig
    /// upper bound: for first iteration (last-most TierConfig) simply U64::MAX,
    ///   later recursively updated with previous TierConfig's required_tenure
    fn extract_held_tenure(
        &self,
        tier: &str,
        start_from: u64,
        end_at: u64,
        max_end: &mut u64,
    ) -> Option<HeldTenure> {
        match self.extract_tenure_and_rate(tier) {
            // "required tenure" serves as lower bound
            // previous iteration's
            Some((begin, rate)) => {
                let ht = HeldTenure::new(rate, start_from, end_at, begin, *max_end);
                *max_end = begin;
                ht
            }
            _ => None,
        }
    }

    /// calculates reward per rarity point, by
    ///   1) recursively extracting tenures,
    ///   2) calling get_reward() on each which isn't None
    ///   3) calculating base rate
    ///   4) folding base rate and non-None tenure rewards
    fn reward_per_rarity_point(&self, start_from: u64, end_at: u64) -> Result<u64> {
        let mut cap = u64::MAX;

        // collect definitively held tenures for 3 periods - still missing base
        let t3 = self.extract_held_tenure("t3", start_from, end_at, &mut cap);
        let t2 = self.extract_held_tenure("t2", start_from, end_at, &mut cap);
        let t1 = self.extract_held_tenure("t1", start_from, end_at, &mut cap);

        // flatten the options and call get_reward() on those that are Some()
        let mut iter = vec![t1, t2, t3]
            .into_iter()
            .flatten()
            .map(|t| t.get_reward());

        // Base case is either base_reward or first applicable tenure, depending
        // on the start position relative to the first applicable tenure
        let init = match start_from < cap {
            // If iter is empty, cap is MAX.  So this can only panic if start_from is also MAX.
            false => iter.next().unwrap(),
            true => self.get_base_reward(start_from, std::cmp::min(cap, end_at)),
        };

        iter.fold(init, |last, this| last?.try_add(this?))
    }

    pub fn reward_amount(&self, start_from: u64, end_at: u64, rarity_points: u64) -> Result<u64> {
        let per_rarity_point = self.reward_per_rarity_point(start_from, end_at)?;

        // considered making this U128, but drastically increases app's complexity
        //   (not just rust-side calc, but also js-side serde)
        // if this is U128 -> newly_accrued_reward() and voided_reward() must be too,
        //   as well as farm.reward_x.funds and farmer.paid_out_reward / farmer.accrued_reward
        //   then we'd do payouts in u64 and subtract the amount from u128 stored (eg 123.123 - 123.0)
        // maybe in v1++, if there's demand from users
        rarity_points
            .try_mul(per_rarity_point)?
            .try_div(self.denominator)
    }
}

#[proc_macros::assert_size(128)]
#[repr(C)]
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FixedRateReward {
    /// configured on funding
    pub schedule: FixedRateSchedule,

    /// amount that has been promised to existing stakers and hence can't be withdrawn
    pub reserved_amount: u64,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}

impl FixedRateReward {
    pub fn fund_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        new_config: FixedRateConfig,
    ) -> Result<()> {
        let FixedRateConfig {
            schedule,
            amount,
            duration_sec,
        } = new_config;

        schedule.verify_schedule_invariants();

        times.duration_sec = duration_sec;
        times.reward_end_ts = now_ts.try_add(duration_sec)?;

        funds.total_funded.try_add_assign(amount)?;

        self.schedule = schedule;

        // msg!("recorded new funding of {}", amount);
        Ok(())
    }

    pub fn cancel_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
    ) -> Result<u64> {
        let refund_amount = funds.pending_amount()?.try_sub(self.reserved_amount)?;
        funds.total_refunded.try_add_assign(refund_amount)?;

        times.end_reward(now_ts)?;

        // msg!("prepared a total refund of {}", refund_amount);
        Ok(refund_amount)
    }

    pub fn update_accrued_reward(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        farmer_rarity_points_staked: u64,
        farmer_reward: &mut FarmerReward,
        reenroll: bool,
    ) -> Result<()> {
        let newly_accrued_reward = farmer_reward
            .fixed_rate
            .newly_accrued_reward(now_ts, farmer_rarity_points_staked)?;

        // update farm (move amount from reserved to accrued)
        funds
            .total_accrued_to_stakers
            .try_add_assign(newly_accrued_reward)?;
        self.reserved_amount.try_sub_assign(newly_accrued_reward)?;

        // update farmer
        farmer_reward.update_fixed_reward(now_ts, newly_accrued_reward)?;

        if farmer_reward.fixed_rate.is_staked()
            && farmer_reward.fixed_rate.is_time_to_graduate(now_ts)?
        {
            let original_staking_start =
                self.graduate_farmer(farmer_rarity_points_staked, farmer_reward)?;

            // if desired, we roll them forward with original staking time
            // why would it not be desired?
            //   one scenario is where there isn't sufficient funding to enroll them,
            //   which causes update ix to fail. So instead we can let them opt out of reenrolling
            if reenroll {
                self.enroll_farmer(
                    now_ts,
                    times,
                    funds,
                    farmer_rarity_points_staked,
                    farmer_reward,
                    Some(original_staking_start),
                )?;
            }
        }

        // msg!("updated reward as of {}", now_ts);
        Ok(())
    }

    pub fn enroll_farmer(
        &mut self,
        now_ts: u64,
        times: &mut TimeTracker,
        funds: &mut FundsTracker,
        farmer_rarity_points_staked: u64,
        farmer_reward: &mut FarmerReward,
        original_staking_start: Option<u64>, //used when we roll a farmer forward, w/o them unstaking
    ) -> Result<()> {
        // calc time left
        // do NOT throw an error if 0 - A might hav ended but B not
        // do NOT return OK(()) - this prevents us from passing down original_staking_start when next reward not ready
        let remaining_duration = times.remaining_duration(now_ts)?;

        // calc any bonus due to previous staking
        farmer_reward.fixed_rate.begin_staking_ts = original_staking_start.unwrap_or(now_ts);
        farmer_reward.fixed_rate.begin_schedule_ts = now_ts;
        let bonus_time = farmer_reward.fixed_rate.loyal_staker_bonus_time()?;

        // calc how much we'd have to reserve for them
        let reserve_amount = self.schedule.reward_amount(
            bonus_time,
            remaining_duration.try_add(bonus_time)?,
            farmer_rarity_points_staked,
        )?;
        if reserve_amount > funds.pending_amount()? {
            return Err(error!(ErrorCode::RewardUnderfunded));
        }

        // update farmer
        farmer_reward.fixed_rate.last_updated_ts = now_ts;
        farmer_reward.fixed_rate.promised_schedule = self.schedule;
        farmer_reward.fixed_rate.promised_duration = remaining_duration;

        // update farm
        self.reserved_amount.try_add_assign(reserve_amount)?;

        // msg!("enrolled farmer as of {}", now_ts);
        Ok(())
    }

    /// called in these sits:
    /// 1) by the staker themselves, when they unstake
    /// 2) by the staker themselves, when they stake extra gems
    /// 3) by the farm if is_time_to_graduate
    /// returns original staking time
    pub fn graduate_farmer(
        &mut self,
        farmer_rarity_points_staked: u64,
        farmer_reward: &mut FarmerReward,
    ) -> Result<u64> {
        let original_begin_staking_ts = farmer_reward.fixed_rate.begin_staking_ts;

        // reduce reserved amount
        let voided_reward = farmer_reward
            .fixed_rate
            .voided_reward(farmer_rarity_points_staked)?;

        self.reserved_amount.try_sub_assign(voided_reward)?;

        // zero out the data on the farmer
        farmer_reward.fixed_rate = FarmerFixedRateReward::default();

        // msg!("graduated farmer on {}", now_ts);
        Ok(original_begin_staking_ts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    impl FixedRateSchedule {
        pub fn new_base(base_rate: u64, denominator: u64) -> Self {
            Self {
                base_rate,
                tier1: None,
                tier2: None,
                tier3: None,
                denominator,
            }
        }
        pub fn new_t1(reward_rate: u64, required_tenure: u64) -> Self {
            //30 + ...
            Self {
                base_rate: 3,
                tier1: Some(TierConfig {
                    reward_rate,
                    required_tenure,
                }),
                tier2: None,
                tier3: None,
                denominator: 1,
            }
        }
        pub fn new_t2(reward_rate: u64, required_tenure: u64) -> Self {
            //30 + 50 + ...
            Self {
                base_rate: 3,
                tier1: Some(TierConfig {
                    reward_rate: 5,
                    required_tenure: 10,
                }),
                tier2: Some(TierConfig {
                    reward_rate,
                    required_tenure,
                }),
                tier3: None,
                denominator: 1,
            }
        }
        pub fn new_t3(
            reward_rate2: u64,
            required_tenure2: u64,
            reward_rate3: u64,
            required_tenure3: u64,
        ) -> Self {
            //30 + 50 + ... + ...
            Self {
                base_rate: 3,
                tier1: Some(TierConfig {
                    reward_rate: 5,
                    required_tenure: 10,
                }),
                tier2: Some(TierConfig {
                    reward_rate: reward_rate2,
                    required_tenure: required_tenure2,
                }),
                tier3: Some(TierConfig {
                    reward_rate: reward_rate3,
                    required_tenure: required_tenure3,
                }),
                denominator: 1,
            }
        }
        pub fn bad_t2() -> Self {
            Self {
                base_rate: 3,
                tier1: None,
                tier2: Some(TierConfig {
                    reward_rate: 7,
                    required_tenure: 20,
                }),
                tier3: None,
                denominator: 1,
            }
        }
        pub fn bad_t3_gap_t1() -> Self {
            Self {
                base_rate: 3,
                tier1: None,
                tier2: Some(TierConfig {
                    reward_rate: 7,
                    required_tenure: 20,
                }),
                tier3: Some(TierConfig {
                    reward_rate: 11,
                    required_tenure: 30,
                }),
                denominator: 1,
            }
        }
        pub fn bad_t3_gap_t2() -> Self {
            Self {
                base_rate: 3,
                tier1: Some(TierConfig {
                    reward_rate: 5,
                    required_tenure: 10,
                }),
                tier2: None,
                tier3: Some(TierConfig {
                    reward_rate: 11,
                    required_tenure: 30,
                }),
                denominator: 1,
            }
        }
    }

    #[test]
    fn test_good_schedule_invariants() {
        let base = FixedRateSchedule::new_base(3, 1);
        base.verify_schedule_invariants();

        let t1 = FixedRateSchedule::new_t1(5, 10);
        t1.verify_schedule_invariants();

        let t1_min = FixedRateSchedule::new_t1(5, 0);
        t1_min.verify_schedule_invariants();

        let t2 = FixedRateSchedule::new_t2(7, 20);
        t2.verify_schedule_invariants();

        let t2_min = FixedRateSchedule::new_t2(7, 10);
        t2_min.verify_schedule_invariants();

        let t3 = FixedRateSchedule::new_t3(7, 20, 11, 30);
        t3.verify_schedule_invariants();

        let t3_min = FixedRateSchedule::new_t3(7, 20, 11, 20);
        t3_min.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t2_bad_tenure() {
        let t2 = FixedRateSchedule::new_t2(7, 9);
        t2.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t3_bad_tenure_t2() {
        let t3 = FixedRateSchedule::new_t3(7, 20, 11, 19);
        t3.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t3_bad_tenure_t3() {
        let t3 = FixedRateSchedule::new_t3(7, 9, 11, 30);
        t3.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t2_bad_gap() {
        let t2 = FixedRateSchedule::bad_t2();
        t2.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t3_bad_gap_t1() {
        let t3 = FixedRateSchedule::bad_t3_gap_t1();
        t3.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_t3_bad_gap_t2() {
        let t3 = FixedRateSchedule::bad_t3_gap_t2();
        t3.verify_schedule_invariants();
    }

    #[test]
    #[should_panic]
    fn test_base_bad_denominator() {
        let base = FixedRateSchedule::new_base(1, 0);
        base.verify_schedule_invariants();
    }

    #[test]
    fn test_base_reward_amounts() {
        let base = FixedRateSchedule::new_base(3, 1);

        // zero case
        let amount = base.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        let amount = base.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 3 * 5 * 10);

        let amount = base.reward_amount(3, 5, 10).unwrap();
        assert_eq!(amount, 3 * 2 * 10);

        // max out case
        let amount = base.reward_amount(5, 5, 10).unwrap();
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_base_reward_amounts_with_denominator() {
        let base = FixedRateSchedule::new_base(3, 10);

        // zero case
        let amount = base.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        let amount = base.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 3 * 5);

        let amount = base.reward_amount(3, 5, 10).unwrap();
        assert_eq!(amount, 3 * 2);

        // max out case
        let amount = base.reward_amount(5, 5, 10).unwrap();
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_base_reward_amounts_with_inconvenient_denominator() {
        let base = FixedRateSchedule::new_base(3, 7);

        // zero case
        let amount = base.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        let amount = base.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 21); //floor division

        let amount = base.reward_amount(3, 5, 10).unwrap();
        assert_eq!(amount, 8); //floor division

        // max out case
        let amount = base.reward_amount(5, 5, 10).unwrap();
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_t1_reward_amounts() {
        let t1 = FixedRateSchedule::new_t1(5, 10);

        // zero case
        let amount = t1.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        // base only case
        let amount = t1.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 3 * 5 * 10);

        // t1 only case
        let amount = t1.reward_amount(10, 15, 10).unwrap();
        assert_eq!(amount, 5 * 5 * 10);

        // base + t1 case
        let amount = t1.reward_amount(0, 15, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 5) * 10);

        // max out case
        let amount = t1.reward_amount(25, 25, 10).unwrap();
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_t2_reward_amounts() {
        let t2 = FixedRateSchedule::new_t2(7, 20);

        // zero case
        let amount = t2.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        // base only case
        let amount = t2.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 3 * 5 * 10);

        // t1 only case
        let amount = t2.reward_amount(10, 15, 10).unwrap();
        assert_eq!(amount, 5 * 5 * 10);

        // base + t1 case
        let amount = t2.reward_amount(0, 15, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 5) * 10);

        // t2 only case
        let amount = t2.reward_amount(20, 25, 10).unwrap();
        assert_eq!(amount, (7 * 5) * 10);

        // t1 + t2 case
        let amount = t2.reward_amount(10, 25, 10).unwrap();
        assert_eq!(amount, (5 * 10 + 7 * 5) * 10);

        // base + t1 + t2 case
        let amount = t2.reward_amount(0, 25, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 10 + 7 * 5) * 10);

        // max out case
        let amount = t2.reward_amount(25, 25, 10).unwrap();
        assert_eq!(amount, 0);
    }

    #[test]
    fn test_t3_reward_amounts() {
        let t3 = FixedRateSchedule::new_t3(7, 20, 11, 30);

        // zero case
        let amount = t3.reward_amount(0, 0, 10).unwrap();
        assert_eq!(amount, 0);

        // base only case
        let amount = t3.reward_amount(0, 5, 10).unwrap();
        assert_eq!(amount, 3 * 5 * 10);

        // t1 only case
        let amount = t3.reward_amount(10, 15, 10).unwrap();
        assert_eq!(amount, 5 * 5 * 10);

        // base + t1 case
        let amount = t3.reward_amount(0, 15, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 5) * 10);

        // t2 only case
        let amount = t3.reward_amount(20, 25, 10).unwrap();
        assert_eq!(amount, (7 * 5) * 10);

        // t1 + t2 case
        let amount = t3.reward_amount(10, 25, 10).unwrap();
        assert_eq!(amount, (5 * 10 + 7 * 5) * 10);

        // base + t1 + t2 case
        let amount = t3.reward_amount(0, 25, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 10 + 7 * 5) * 10);

        // t3 only case
        let amount = t3.reward_amount(30, 35, 10).unwrap();
        assert_eq!(amount, (11 * 5) * 10);

        // t2 + t3 case
        let amount = t3.reward_amount(20, 35, 10).unwrap();
        assert_eq!(amount, (7 * 10 + 11 * 5) * 10);

        // t1 + t2 + t3 case
        let amount = t3.reward_amount(10, 35, 10).unwrap();
        assert_eq!(amount, (5 * 10 + 7 * 10 + 11 * 5) * 10);

        // base + t1 + t2 + t3 case
        let amount = t3.reward_amount(0, 35, 10).unwrap();
        assert_eq!(amount, (3 * 10 + 5 * 10 + 7 * 10 + 11 * 5) * 10);

        // max out case
        let amount = t3.reward_amount(35, 35, 10).unwrap();
        assert_eq!(amount, 0);
    }
}
