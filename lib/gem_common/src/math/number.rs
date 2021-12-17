//! Yet another decimal library

use std::{
    iter::Sum,
    ops::{Add, AddAssign, Div, DivAssign, Mul, MulAssign, Sub, SubAssign},
};

use crate::errors::ErrorCode;
use crate::TrySub;
use anchor_lang::prelude::*;
use std::fmt::{Display, Formatter};
use thiserror::Error;

uint::construct_uint! {
    pub struct U192(3);
}

pub const BPS_EXPONENT: i32 = -4;
const PRECISION: i32 = 15;
const ONE: U192 = U192([1_000_000_000_000_000, 0, 0]);
const U64_MAX: U192 = U192([0xffffffffffffffff, 0x0, 0x0]);

#[derive(Default, Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd)]
#[repr(transparent)]
pub struct Number(U192);

static_assertions::const_assert_eq!(24, std::mem::size_of::<Number>());
static_assertions::const_assert_eq!(0, std::mem::size_of::<Number>() % 8);
impl Number {
    pub const ONE: Number = Number(ONE);
    pub const ZERO: Number = Number(U192::zero());

    /// Convert this number to fit in a u64
    ///
    /// The precision of the number in the u64 is based on the
    /// exponent provided.
    pub fn as_u64(&self, exponent: impl Into<i32>) -> u64 {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        let target_value = self.0 / prec_value;
        if target_value > U64_MAX {
            panic!("cannot convert to u64 due to overflow");
        }

        target_value.as_u64()
    }

    /// Ceiling value of number, fit in a u64
    ///
    /// The precision of the number in the u64 is based on the
    /// exponent provided.
    ///
    /// The result is rounded up to the nearest one, based on the
    /// target precision.
    pub fn as_u64_ceil(&self, exponent: impl Into<i32>) -> u64 {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        let target_value = (prec_value - U192::from(1) + self.0) / prec_value;
        if target_value > U64_MAX {
            panic!("cannot convert to u64 due to overflow");
        }

        target_value.as_u64()
    }

    /// Convert this number to fit in a u64
    ///
    /// The precision of the number in the u64 is based on the
    /// exponent provided.
    ///
    /// The result is rounded to the nearest one, based on the
    /// target precision.
    pub fn as_u64_rounded(&self, exponent: impl Into<i32>) -> u64 {
        let extra_precision = PRECISION + exponent.into();
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32);

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        let rounding = match extra_precision > 0 {
            true => U192::from(1) * prec_value / 2,
            false => U192::zero(),
        };

        let target_value = (rounding + self.0) / prec_value;
        if target_value > U64_MAX {
            panic!("cannot convert to u64 due to overflow");
        }

        target_value.as_u64()
    }

    pub fn from_decimal(value: impl Into<U192>, exponent: impl Into<i32>) -> Self {
        // interesting, so exponent needs to be 1 or less, because we're already at 15
        let extra_precision = PRECISION + exponent.into(); //eg default 15
        let mut prec_value = Self::ten_pow(extra_precision.abs() as u32); //eg then 1_000_000_000_000_000

        if extra_precision < 0 {
            prec_value = ONE / prec_value;
        }

        Self(value.into() * prec_value) //eg then value * 1_000_000_000_000_000
    }

    pub fn from_bps(basis_points: u16) -> Number {
        Number::from_decimal(basis_points, BPS_EXPONENT) //15-4 = 11 precision
    }

    pub fn pow(&self, exp: impl Into<Number>) -> Number {
        let value = self.0.pow(exp.into().0);

        Self(value)
    }

    fn ten_pow(exponent: u32) -> U192 {
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

// --------------------------------------- add

impl Add<Number> for Number {
    type Output = Number;

    fn add(self, rhs: Number) -> Self::Output {
        Self(self.0.add(rhs.0))
    }
}

impl AddAssign<Number> for Number {
    fn add_assign(&mut self, rhs: Number) {
        self.0.add_assign(rhs.0)
    }
}

// --------------------------------------- sub

impl Sub<Number> for Number {
    type Output = Number;

    fn sub(self, rhs: Number) -> Self::Output {
        Self(self.0.sub(rhs.0))
    }
}

impl SubAssign<Number> for Number {
    fn sub_assign(&mut self, rhs: Number) {
        self.0.sub_assign(rhs.0)
    }
}

impl TrySub for Number {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError> {
        let result = self
            .0
            .checked_sub(rhs.0)
            .ok_or::<ProgramError>(ErrorCode::ArithmeticError.into())?;
        Ok(Self(result))
    }
    fn try_sub_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_sub(rhs)?;
        Ok(())
    }
}

// --------------------------------------- mul

impl Mul<Number> for Number {
    type Output = Number;

    fn mul(self, rhs: Number) -> Self::Output {
        Self(self.0.mul(rhs.0).div(ONE))
    }
}

impl MulAssign<Number> for Number {
    fn mul_assign(&mut self, rhs: Number) {
        self.0.mul_assign(rhs.0);
        self.0.div_assign(ONE);
    }
}

impl<T: Into<U192>> Mul<T> for Number {
    type Output = Number;

    fn mul(self, rhs: T) -> Self::Output {
        Self(self.0.mul(rhs.into()))
    }
}

// --------------------------------------- div

impl Div<Number> for Number {
    type Output = Number;

    fn div(self, rhs: Number) -> Self::Output {
        Self(self.0.mul(ONE).div(rhs.0))
    }
}

impl<T: Into<U192>> Div<T> for Number {
    type Output = Number;

    fn div(self, rhs: T) -> Self::Output {
        Self(self.0.div(rhs.into()))
    }
}

// --------------------------------------- sum

impl Sum for Number {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.reduce(|a, b| a + b).unwrap_or(Self::ZERO)
    }
}

// --------------------------------------- from / into

impl<T: Into<U192>> From<T> for Number {
    fn from(n: T) -> Number {
        Number(n.into() * ONE)
    }
}

impl From<Number> for [u8; 24] {
    fn from(n: Number) -> Self {
        n.0.into()
    }
}

// --------------------------------------- display

impl Display for Number {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let rem = self.0 % ONE;
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
        if self.0 < ONE {
            write!(f, "0.{}", pretty_decimals)?;
        } else {
            let int = self.0 / ONE;
            write!(f, "{}.{}", int, pretty_decimals)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_equals_zero() {
        assert_eq!(Number::ZERO, Number::from_decimal(0, 0));
        assert_eq!(Number::ZERO, Number::from(0u64));
    }

    #[test]
    fn one_equals_one() {
        assert_eq!(Number::ONE, Number::from_decimal(1, 0));
        assert_eq!(Number::ONE, Number::from(1u64));
    }

    #[test]
    fn one_plus_one_equals_two() {
        assert_eq!(Number::from_decimal(2, 0), Number::ONE + Number::ONE);
    }

    #[test]
    fn one_minus_one_equals_zero() {
        assert_eq!(Number::ONE - Number::ONE, Number::ZERO);
    }

    #[test]
    fn one_times_one_equals_one() {
        assert_eq!(Number::ONE, Number::ONE * Number::ONE);
    }

    #[test]
    fn one_divided_by_one_equals_one() {
        assert_eq!(Number::ONE, Number::ONE / Number::ONE);
    }

    #[test]
    fn ten_div_100_equals_point_1() {
        assert_eq!(
            Number::from_decimal(1, -1),
            Number::from_decimal(1, 1) / Number::from_decimal(100, 0)
        );
    }

    #[test]
    fn multiply_by_u64() {
        assert_eq!(
            Number::from_decimal(3, 1),
            Number::from_decimal(1, 1) * 3u64
        )
    }

    #[test]
    fn ceil_gt_one() {
        assert_eq!(Number::from_decimal(11, -1).as_u64_ceil(0), 2u64);
        assert_eq!(Number::from_decimal(19, -1).as_u64_ceil(0), 2u64);
    }

    #[test]
    fn ceil_lt_one() {
        assert_eq!(Number::from_decimal(1, -1).as_u64_ceil(0), 1u64);
        assert_eq!(Number::from_decimal(1, -10).as_u64_ceil(0), 1u64);
    }

    #[test]
    fn ceil_of_int() {
        assert_eq!(Number::from_decimal(1, 0).as_u64_ceil(0), 1u64);
        assert_eq!(
            Number::from_decimal(1_000_000u64, 0).as_u64_ceil(0),
            1_000_000u64
        );
    }

    #[test]
    fn to_string() {
        assert_eq!("1000.0", Number::from(1000).to_string());
        assert_eq!("1.0", Number::from(1).to_string());
        assert_eq!("0.001", Number::from_decimal(1, -3).to_string());
    }
}
