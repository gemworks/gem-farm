//! Yet another decimal lib
//!
//! This one in particular suited to peculiarities of Anchor -
//! specifically that it doesn't support Newtypes
//!
//! Pros: generates IDL, no need for manual serde
//! Cons:
//!  1) can't use https://docs.rs/uint/0.9.1/uint/ so dropped to u128
//!  2) have to keep the file inside the crate, can't have as separate lib

use std::{
    convert::TryFrom,
    fmt::{Display, Formatter},
};

use anchor_lang::prelude::*;
use gem_common::{errors::ErrorCode, TryAdd, TryDiv, TryMul, TryPow, TryRem, TrySub};

const ONE: u128 = 1_000;
const PRECISION: i32 = 3;
const U64_MAX: u128 = u64::MAX as u128;

#[derive(
    Default, Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, AnchorSerialize, AnchorDeserialize,
)]
pub struct Number128 {
    n: u128,
}

impl Number128 {
    pub const ONE: Self = Self { n: ONE };
    pub const ZERO: Self = Self { n: 0 };

    pub fn as_u64(&self, exponent: impl Into<i32>) -> Result<u64> {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        let target_value = self.n / prec_value;
        if target_value > U64_MAX {
            panic!("cannot convert to u64 due to overflow");
        }

        u64::try_from(target_value).map_err(|_| error!(ErrorCode::ArithmeticError))
    }

    pub fn as_u64_ceil(&self, exponent: impl Into<i32>) -> Result<u64> {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        let target_value = (prec_value - 1 + self.n) / prec_value;
        if target_value > U64_MAX {
            panic!("cannot convert to u64 due to overflow");
        }

        u64::try_from(target_value).map_err(|_| error!(ErrorCode::ArithmeticError))
    }

    pub fn from_decimal(value: impl Into<u128>, exponent: impl Into<i32>) -> Self {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        Self {
            n: value.into() * prec_value,
        }
    }

    fn ten_pow(exponent: u32) -> u128 {
        let value: u64 = match exponent {
            16 => 10_000_000_000_000_000,
            15 => 1_000_000_000_000_000,
            14 => 100_000_000_000_000,
            13 => 10_000_000_000_000,
            12 => 1_000_000_000_000,
            11 => 100_000_000_000,
            10 => 10_000_000_000,
            9 => 1_000_000_000,
            8 => 100_000_000,
            7 => 10_000_000,
            6 => 1_000_000,
            5 => 100_000,
            4 => 10_000,
            3 => 1_000,
            2 => 100,
            1 => 10,
            0 => 1,
            _ => panic!("no support for exponent: {}", exponent),
        };

        value.into()
    }
}

impl TrySub for Number128 {
    fn try_sub(self, rhs: Self) -> Result<Self> {
        let result = self.n.checked_sub(rhs.n).ok_or_else(|| {
            msg!("tried subtracting {} from {}", rhs, self);
            error!(ErrorCode::ArithmeticError)
        })?;
        Ok(Self { n: result })
    }
}

impl TryAdd for Number128 {
    fn try_add(self, rhs: Self) -> Result<Self> {
        let result = self.n.checked_add(rhs.n).ok_or_else(|| {
            msg!("tried adding {} and {}", rhs, self);
            error!(ErrorCode::ArithmeticError)
        })?;
        Ok(Self { n: result })
    }
}

impl TryDiv for Number128 {
    fn try_div(self, rhs: Self) -> Result<Self> {
        let result = self
            .n
            .checked_mul(ONE)
            .ok_or_else(|| {
                msg!("tried dividing {} by {} (scale up)", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?
            .checked_div(rhs.n)
            .ok_or_else(|| {
                msg!("tried dividing {} by {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?;
        Ok(Self { n: result })
    }
    fn try_ceil_div(self, rhs: Self) -> Result<Self> {
        self.try_div(rhs)
    }
    fn try_rounded_div(self, rhs: Self) -> Result<Self> {
        self.try_div(rhs)
    }
}

impl TryMul for Number128 {
    fn try_mul(self, rhs: Self) -> Result<Self> {
        let result = self
            .n
            .checked_mul(rhs.n)
            .ok_or_else(|| {
                msg!("tried multiplying {} and {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?
            .checked_div(ONE)
            .ok_or_else(|| {
                msg!("tried multiplying {} and {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?;
        Ok(Self { n: result })
    }
}

impl TryPow for Number128 {
    fn try_pow(self, rhs: u32) -> Result<Self> {
        let result = self
            .n
            .checked_pow(rhs)
            .ok_or_else(|| {
                msg!("tried raising {} to power {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?
            .checked_div(ONE)
            .ok_or_else(|| {
                msg!("tried raising {} to power {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?;
        Ok(Self { n: result })
    }
}

impl TryRem for Number128 {
    fn try_rem(self, rhs: Self) -> Result<Self> {
        let result = self
            .n
            .checked_mul(ONE)
            .ok_or_else(|| {
                msg!("tried getting the remainder of {} / {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?
            .checked_rem(rhs.n)
            .ok_or_else(|| {
                msg!("tried getting the remainder of {} / {}", self, rhs);
                error!(ErrorCode::ArithmeticError)
            })?;
        Ok(Self { n: result })
    }
}

impl<T: Into<u128>> From<T> for Number128 {
    fn from(n: T) -> Number128 {
        Number128 { n: n.into() * ONE }
    }
}

impl Display for Number128 {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let rem = self.n % ONE;
        let decimal_digits = PRECISION as usize;
        let rem_str = rem.to_string();
        // regular padding like {:010} doesn't work with U192
        let decimals = "0".repeat(decimal_digits - rem_str.len()) + &*rem_str;
        let stripped_decimals = decimals.trim_end_matches('0');
        let pretty_decimals = if stripped_decimals.is_empty() {
            "0"
        } else {
            stripped_decimals
        };
        if self.n < ONE {
            write!(f, "0.{}", pretty_decimals)?;
        } else {
            let int = self.n / ONE;
            write!(f, "{}.{}", int, pretty_decimals)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests2 {
    use super::*;

    #[test]
    fn zero_equals_zero() {
        assert_eq!(Number128::ZERO, Number128::from_decimal(0_u64, 0_i32));
        assert_eq!(Number128::ZERO, Number128::from(0u64));
    }

    #[test]
    fn one_equals_one() {
        assert_eq!(Number128::ONE, Number128::from_decimal(1_u64, 0_i32));
        assert_eq!(Number128::ONE, Number128::from(1u64));
    }

    #[test]
    fn one_plus_one_equals_two() {
        assert_eq!(
            Number128::from_decimal(2_u64, 0_i32),
            Number128::ONE.try_add(Number128::ONE).unwrap()
        )
    }

    #[test]
    fn one_minus_one_equals_zero() {
        assert_eq!(
            Number128::ONE.try_sub(Number128::ONE).unwrap(),
            Number128::ZERO
        );
    }

    #[test]
    fn one_times_one_equals_one() {
        assert_eq!(
            Number128::ONE,
            Number128::ONE.try_mul(Number128::ONE).unwrap()
        );
    }

    #[test]
    fn one_divided_by_one_equals_one() {
        assert_eq!(
            Number128::ONE,
            Number128::ONE.try_div(Number128::ONE).unwrap()
        );
    }

    #[test]
    fn ten_div_100_equals_point_1() {
        assert_eq!(
            Number128::from_decimal(1_u64, -1_i32),
            Number128::from_decimal(1_u64, 1_i32)
                .try_div(Number128::from_decimal(100_u64, 0_i32))
                .unwrap()
        );
    }

    #[test]
    fn multiply_by_u64() {
        assert_eq!(
            Number128::from_decimal(3_u64, 1_i32),
            Number128::from_decimal(1_u64, 1_i32)
                .try_mul(Number128::from_decimal(3_u64, 0_i32))
                .unwrap()
        )
    }

    #[test]
    fn ceil_gt_one() {
        assert_eq!(
            Number128::from_decimal(11_u64, -1_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            2u64
        );
        assert_eq!(
            Number128::from_decimal(19_u64, -1_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            2u64
        );
    }

    #[test]
    fn ceil_lt_one() {
        assert_eq!(
            Number128::from_decimal(1_u64, -1_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            1u64
        );
        assert_eq!(
            Number128::from_decimal(1_u64, -10_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            1u64
        );
    }

    #[test]
    fn ceil_of_int() {
        assert_eq!(
            Number128::from_decimal(1_u64, 0_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            1u64
        );
        assert_eq!(
            Number128::from_decimal(1_000_000u64, 0_i32)
                .as_u64_ceil(0_i32)
                .unwrap(),
            1_000_000u64
        );
    }

    #[test]
    fn to_string() {
        assert_eq!("1000.0", Number128::from(1000_u64).to_string());
        assert_eq!("1.0", Number128::from(1_u64).to_string());
        assert_eq!("0.001", Number128::from_decimal(1_u64, -3_i32).to_string());
    }

    #[test]
    fn test_div() {
        //the easy (no remainder) case
        let x = Number128::from(10_u64);
        let y = Number128::from(5_u64);
        let r = x.try_div(y).unwrap();
        assert_eq!(r, Number128::from(2_u64));

        //<.5 case (2.2)
        let x = Number128::from(11_u64);
        let y = Number128::from(5_u64);
        let r = x.try_div(y).unwrap();
        assert_eq!(r, Number128::from_decimal(22_u64, -1_i32));

        //>.5 case (2.8)
        let x = Number128::from(14_u64);
        let y = Number128::from(5_u64);
        let r = x.try_div(y).unwrap();
        assert_eq!(r, Number128::from_decimal(28_u64, -1_i32));

        //.5 case
        let x = Number128::from(5_u64);
        let y = Number128::from(2_u64);
        let r = x.try_div(y).unwrap();
        assert_eq!(r, Number128::from_decimal(25_u64, -1_i32));
    }

    #[test]
    fn test_add_assign() {
        let mut x = Number128::from(10_u64);
        let y = Number128::from(2_u64);
        x.try_add_assign(y).unwrap();
        assert_eq!(x, Number128::from(12_u64));
    }

    #[test]
    fn test_sub_assign() {
        let mut x = Number128::from(10_u64);
        let y = Number128::from(2_u64);
        x.try_sub_assign(y).unwrap();
        assert_eq!(x, Number128::from(8_u64));
    }

    #[test]
    fn test_div_assign() {
        let mut x = Number128::from(10_u64);
        let y = Number128::from(2_u64);
        x.try_div_assign(y).unwrap();
        assert_eq!(x, Number128::from(5_u64));
    }

    #[test]
    fn test_mul_assign() {
        let mut x = Number128::from(10_u64);
        let y = Number128::from(2_u64);
        x.try_mul_assign(y).unwrap();
        assert_eq!(x, Number128::from(20_u64));
    }

    #[test]
    fn test_pow_assign() {
        let mut x = Number128::from(10_u64);
        let y = 2;
        x.try_pow_assign(y).unwrap();
        assert_eq!(x, Number128::from(100_u64));
    }
}
