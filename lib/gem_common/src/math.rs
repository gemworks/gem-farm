use std::convert::TryFrom;

use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

// --------------------------------------- traits

pub trait TrySub: Sized {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_self_sub(&mut self, rhs: Self) -> ProgramResult;
}

pub trait TryAdd: Sized {
    fn try_add(self, rhs: Self) -> Result<Self, ProgramError>;
    fn try_self_add(&mut self, rhs: Self) -> ProgramResult;
}

pub trait TryDiv<RHS>: Sized {
    fn try_floor_div(self, rhs: RHS) -> Result<Self, ProgramError>;
    // fn try_ceil_div(self, rhs: RHS) -> Result<Self, ProgramError>;
}

pub trait TryMul<RHS>: Sized {
    fn try_mul(self, rhs: RHS) -> Result<Self, ProgramError>;
}

pub trait TryPow<RHS>: Sized {
    fn try_pow(self, rhs: RHS) -> Result<Self, ProgramError>;
}

// pub trait TrySqrt: Sized {
//     fn try_sqrt(self) -> Result<Self, ProgramError>;
// }

pub trait TryRem: Sized {
    fn try_rem(self, rhs: Self) -> Result<Self, ProgramError>;
}

pub trait TryCast<Into>: Sized {
    fn try_cast(self) -> Result<Into, ProgramError>;
}

//todo can the below be DRYed up using a macro?

// --------------------------------------- u32

impl TrySub for u32 {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_sub(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_sub(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_sub(rhs)?;
        Ok(())
    }
}

impl TryAdd for u32 {
    fn try_add(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_add(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_add(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_add(rhs)?;
        Ok(())
    }
}

impl TryDiv<u32> for u32 {
    fn try_floor_div(self, rhs: u32) -> Result<Self, ProgramError> {
        self.checked_div(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryMul<u32> for u32 {
    fn try_mul(self, rhs: u32) -> Result<Self, ProgramError> {
        self.checked_mul(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryPow<u32> for u32 {
    fn try_pow(self, rhs: u32) -> Result<Self, ProgramError> {
        self.checked_pow(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryRem for u32 {
    fn try_rem(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_rem(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

// --------------------------------------- u64

impl TrySub for u64 {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_sub(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_sub(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_sub(rhs)?;
        Ok(())
    }
}

impl TryAdd for u64 {
    fn try_add(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_add(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_add(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_add(rhs)?;
        Ok(())
    }
}

impl TryDiv<u64> for u64 {
    fn try_floor_div(self, rhs: u64) -> Result<Self, ProgramError> {
        self.checked_div(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryMul<u64> for u64 {
    fn try_mul(self, rhs: u64) -> Result<Self, ProgramError> {
        self.checked_mul(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryPow<u32> for u64 {
    fn try_pow(self, rhs: u32) -> Result<Self, ProgramError> {
        self.checked_pow(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryRem for u64 {
    fn try_rem(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_rem(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

// --------------------------------------- u128

impl TrySub for u128 {
    fn try_sub(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_sub(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_sub(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_sub(rhs)?;
        Ok(())
    }
}

impl TryAdd for u128 {
    fn try_add(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_add(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
    fn try_self_add(&mut self, rhs: Self) -> ProgramResult {
        *self = self.try_add(rhs)?;
        Ok(())
    }
}

impl TryDiv<u128> for u128 {
    fn try_floor_div(self, rhs: u128) -> Result<Self, ProgramError> {
        self.checked_div(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryMul<u128> for u128 {
    fn try_mul(self, rhs: u128) -> Result<Self, ProgramError> {
        self.checked_mul(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryPow<u32> for u128 {
    fn try_pow(self, rhs: u32) -> Result<Self, ProgramError> {
        self.checked_pow(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryRem for u128 {
    fn try_rem(self, rhs: Self) -> Result<Self, ProgramError> {
        self.checked_rem(rhs)
            .ok_or(ErrorCode::ArithmeticError.into())
    }
}

impl TryCast<u64> for u128 {
    fn try_cast(self) -> Result<u64, ProgramError> {
        u64::try_from(self).map_err(|_| ErrorCode::ArithmeticError.into())
    }
}

// --------------------------------------- tests

// todo need more extensive testing, probably a test for each type
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_div() {
        //the easy (no remainder) case
        let x = 10_u64;
        let y = 5;
        let r = x.try_floor_div(y).unwrap();
        assert_eq!(r, 2);

        //<.5 case (2.2)
        let x = 11_u64;
        let y = 5;
        let r = x.try_floor_div(y).unwrap();
        assert_eq!(r, 2);

        //>.5 case (2.8)
        let x = 14_u64;
        let y = 5;
        let r = x.try_floor_div(y).unwrap();
        assert_eq!(r, 2);

        //.5 case
        let x = 5_u64;
        let y = 2;
        let r = x.try_floor_div(y).unwrap();
        assert_eq!(r, 2);
    }

    #[test]
    fn test_self_add() {
        let mut x = 10_u64;
        let y = 2;
        x.try_self_add(y).unwrap();
        assert_eq!(x, 12);
    }

    #[test]
    fn test_self_sub() {
        let mut x = 10_u64;
        let y = 2;
        x.try_self_sub(y).unwrap();
        assert_eq!(x, 8);
    }
}
