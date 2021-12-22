use std::convert::TryFrom;

use anchor_lang::prelude::*;
use spl_math::approximations::sqrt;

use crate::errors::ErrorCode;

// --------------------------------------- traits

pub trait TrySub: Sized + Copy {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_sub_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_sub(rhs)?;
        Ok(())
    }
}

pub trait TryAdd: Sized + Copy {
    fn try_add(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_add_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_add(rhs)?;
        Ok(())
    }
}

pub trait TryDiv: Sized + Copy {
    fn try_div(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_div_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_div(rhs)?;
        Ok(())
    }

    fn try_ceil_div(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_ceil_div_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_ceil_div(rhs)?;
        Ok(())
    }

    fn try_rounded_div(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_rounded_div_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_rounded_div(rhs)?;
        Ok(())
    }
}

pub trait TryMul: Sized + Copy {
    fn try_mul(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_mul_assign(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_mul(rhs)?;
        Ok(())
    }
}

pub trait TryPow: Sized + Copy {
    fn try_pow(self, rhs: u32) -> Result<Self, ProgramError>;
    fn try_pow_assign(&mut self, rhs: u32) -> ProgramResult {
        *self = self.try_pow(rhs)?;
        Ok(())
    }
}

pub trait TrySqrt: Sized + Copy {
    fn try_sqrt(self) -> Result<Self, ProgramError>;
    fn try_sqrt_assign(&mut self) -> ProgramResult {
        *self = self.try_sqrt()?;
        Ok(())
    }
}

pub trait TryRem: Sized + Copy {
    fn try_rem(self, rhs: Self) -> Result<Self, ProgramError>;
}

pub trait TryCast<Into>: Sized + Copy {
    fn try_cast(self) -> Result<Into, ProgramError>;
}

pub trait TrySum: Sized + Copy + TryAdd {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Result<Self, ProgramError> {
        // todo for now using unwrap() since can't "?" inside an iterator
        iter.reduce(|a, b| a.try_add(b).unwrap())
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

// --------------------------------------- impl

macro_rules! try_math {
    ($our_type:ty) => {
        impl TrySub for $our_type {
            fn try_sub(self, rhs: Self) -> Result<Self, ProgramError> {
                self.checked_sub(rhs).ok_or({
                    // msg!("tried subtracting {} from {}", rhs, self);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }

        impl TryAdd for $our_type {
            fn try_add(self, rhs: Self) -> Result<Self, ProgramError> {
                self.checked_add(rhs).ok_or({
                    // msg!("tried adding {} and {}", rhs, self);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }

        impl TryDiv for $our_type {
            fn try_div(self, rhs: Self) -> Result<Self, ProgramError> {
                self.checked_div(rhs).ok_or({
                    // msg!("tried dividing {} by {}", self, rhs);
                    ErrorCode::ArithmeticError.into()
                })
            }
            fn try_ceil_div(self, rhs: Self) -> Result<Self, ProgramError> {
                self.try_sub(1)?.try_div(rhs)?.try_add(1)
            }
            fn try_rounded_div(self, rhs: Self) -> Result<Self, ProgramError> {
                rhs.try_div(2)?.try_add(self)?.try_div(rhs)
            }
        }

        impl TryMul for $our_type {
            fn try_mul(self, rhs: Self) -> Result<Self, ProgramError> {
                self.checked_mul(rhs).ok_or({
                    // msg!("tried multiplying {} and {}", self, rhs);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }

        impl TryPow for $our_type {
            fn try_pow(self, rhs: u32) -> Result<Self, ProgramError> {
                self.checked_pow(rhs).ok_or({
                    // msg!("tried raising {} to power {}", self, rhs);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }

        impl TryRem for $our_type {
            fn try_rem(self, rhs: Self) -> Result<Self, ProgramError> {
                self.checked_rem(rhs).ok_or({
                    // msg!("tried getting the remainder of {} / {}", self, rhs);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }

        // based on solana's spl math crate
        // https://github.com/solana-labs/solana-program-library/blob/master/libraries/math/src/approximations.rs
        impl TrySqrt for $our_type {
            fn try_sqrt(self) -> Result<Self, ProgramError> {
                sqrt(self).ok_or({
                    // msg!("tried taking the square root of {}", self);
                    ErrorCode::ArithmeticError.into()
                })
            }
        }
    };
}

pub(crate) use try_math;

try_math! {u8}
try_math! {i8}
try_math! {u16}
try_math! {i16}
try_math! {u32}
try_math! {i32}
try_math! {u64}
try_math! {i64}
try_math! {u128}
try_math! {i128}

impl TryCast<u64> for u128 {
    fn try_cast(self) -> Result<u64, ProgramError> {
        u64::try_from(self).map_err(|_| ErrorCode::ArithmeticError.into())
    }
}

impl TryCast<u32> for u64 {
    fn try_cast(self) -> Result<u32, ProgramError> {
        u32::try_from(self).map_err(|_| ErrorCode::ArithmeticError.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --------------------------------------- division types

    #[test]
    fn test_div() {
        //the easy (no remainder) case
        let x = 10_u64;
        let y = 5;
        let r = x.try_div(y).unwrap();
        assert_eq!(r, 2);

        //<.5 case (2.2)
        let x = 11_u64;
        let y = 5;
        let r = x.try_div(y).unwrap();
        assert_eq!(r, 2);

        //>.5 case (2.8)
        let x = 14_u64;
        let y = 5;
        let r = x.try_div(y).unwrap();
        assert_eq!(r, 2);

        //.5 case
        let x = 5_u64;
        let y = 2;
        let r = x.try_div(y).unwrap();
        assert_eq!(r, 2);
    }

    #[test]
    fn test_ceil_div() {
        //the easy (no remainder) case
        let x = 10_u64;
        let y = 5;
        let r = x.try_ceil_div(y).unwrap();
        assert_eq!(r, 2);

        //<.5 case (2.2)
        let x = 11_u64;
        let y = 5;
        let r = x.try_ceil_div(y).unwrap();
        assert_eq!(r, 3);

        //>.5 case (2.8)
        let x = 14_u64;
        let y = 5;
        let r = x.try_ceil_div(y).unwrap();
        assert_eq!(r, 3);

        //.5 case
        let x = 5_u64;
        let y = 2;
        let r = x.try_ceil_div(y).unwrap();
        assert_eq!(r, 3);
    }

    #[test]
    fn test_rounded_div() {
        //the easy (no remainder) case
        let x = 10_u64;
        let y = 5;
        let r = x.try_rounded_div(y).unwrap();
        assert_eq!(r, 2);

        //<.5 case (2.2)
        let x = 11_u64;
        let y = 5;
        let r = x.try_rounded_div(y).unwrap();
        assert_eq!(r, 2);

        //>.5 case (2.8)
        let x = 14_u64;
        let y = 5;
        let r = x.try_rounded_div(y).unwrap();
        assert_eq!(r, 3);

        //.5 case
        let x = 5_u64;
        let y = 2;
        let r = x.try_rounded_div(y).unwrap();
        assert_eq!(r, 3);
    }

    // --------------------------------------- assigns

    #[test]
    fn test_add_assign() {
        let mut x = 10_u64;
        let y = 2;
        x.try_add_assign(y).unwrap();
        assert_eq!(x, 12);
    }

    #[test]
    fn test_sub_assign() {
        let mut x = 10_u64;
        let y = 2;
        x.try_sub_assign(y).unwrap();
        assert_eq!(x, 8);
    }

    #[test]
    fn test_div_assign() {
        let mut x = 10_u64;
        let y = 3;
        x.try_div_assign(y).unwrap();
        assert_eq!(x, 3);
    }

    #[test]
    fn test_ceil_div_assign() {
        let mut x = 10_u64;
        let y = 3;
        x.try_ceil_div_assign(y).unwrap();
        assert_eq!(x, 4);
    }

    #[test]
    fn test_rounded_div_assign() {
        let mut x = 10_u64;
        let y = 3;
        x.try_rounded_div_assign(y).unwrap();
        assert_eq!(x, 3);
    }

    #[test]
    fn test_mul_assign() {
        let mut x = 10_u64;
        let y = 2;
        x.try_mul_assign(y).unwrap();
        assert_eq!(x, 20);
    }

    #[test]
    fn test_pow_assign() {
        let mut x = 10_u64;
        let y = 2;
        x.try_pow_assign(y).unwrap();
        assert_eq!(x, 100);
    }

    #[test]
    fn test_sqrt_assign() {
        let mut x = 16_u64;
        x.try_sqrt_assign().unwrap();
        assert_eq!(x, 4);

        let mut x = 25_u64;
        x.try_sqrt_assign().unwrap();
        assert_eq!(x, 5);
    }

    // --------------------------------------- casts

    #[test]
    #[should_panic]
    fn test_try_cast() {
        let x = 0xffffffffffffffff_u64;
        let _y = x.try_cast().unwrap();
    }
}
