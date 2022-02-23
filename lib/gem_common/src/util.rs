use std::convert::TryInto;

use anchor_lang::{prelude::*, solana_program::clock};

pub fn now_ts() -> Result<u64> {
    //i64 -> u64 ok to unwrap
    Ok(clock::Clock::get()?.unix_timestamp.try_into().unwrap())
}
