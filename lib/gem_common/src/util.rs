use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock;
use std::convert::TryInto;

pub fn now_ts() -> Result<u64, ProgramError> {
    //i64 -> u64 ok to unwrap
    Ok(clock::Clock::get()?.unix_timestamp.try_into().unwrap())
}
