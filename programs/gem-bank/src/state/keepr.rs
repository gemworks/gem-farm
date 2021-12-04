use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};
use bytemuck::{Pod, Zeroable};
use jet_proc_macros::assert_size;

const SECONDS_PER_HOUR: UnixTimestamp = 3600;
const SECONDS_PER_2H: UnixTimestamp = SECONDS_PER_HOUR * 2;
const SECONDS_PER_12H: UnixTimestamp = SECONDS_PER_HOUR * 12;
const SECONDS_PER_DAY: UnixTimestamp = SECONDS_PER_HOUR * 24;
const SECONDS_PER_WEEK: UnixTimestamp = SECONDS_PER_DAY * 7;
const SECONDS_PER_YEAR: UnixTimestamp = 31_536_000;

static_assertions::const_assert_eq!(SECONDS_PER_HOUR, 60 * 60);
static_assertions::const_assert_eq!(SECONDS_PER_2H, 60 * 60 * 2);
static_assertions::const_assert_eq!(SECONDS_PER_12H, 60 * 60 * 12);
static_assertions::const_assert_eq!(SECONDS_PER_DAY, 60 * 60 * 24);
static_assertions::const_assert_eq!(SECONDS_PER_WEEK, 60 * 60 * 24 * 7);
static_assertions::const_assert_eq!(SECONDS_PER_YEAR, 60 * 60 * 24 * 365);

#[assert_size(aligns, 24)]
#[repr(C)]
#[derive(Pod, Zeroable, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct KeeprConfig {
    pub max_curator_fee_pct: u16,

    pub min_voters_for_buyout_pct: u16,

    pub min_auction_length_sec: u32,
    pub max_auction_length_sec: u32,

    pub min_reserve_change_factor_pct: u16,
    pub max_reserve_change_factor_pct: u16,

    pub min_bid_increase_pct: u16,

    _reserved: [u8; 6], //needed to align to word size of 8
}

pub const MIN_MIN_AUCTION_LENGTH_SEC: u32 = SECONDS_PER_DAY as u32; //1 day
pub const MAX_MAX_AUCTION_LENGTH_SEC: u32 = SECONDS_PER_WEEK as u32 * 8; //8 weeks
pub const MIN_MIN_VOTERS_FOR_BUYOUT_PCT: u16 = 25; //25%
pub const MIN_MIN_BID_INCREASE_PCT: u16 = 1; //1%
pub const MAX_MIN_BID_INCREASE_PCT: u16 = 10; //10%

#[assert_size(aligns, 16)]
#[repr(C)]
#[derive(Pod, Zeroable, Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub struct KeeprLimits {
    pub min_min_auction_length_sec: u32,
    pub max_max_auction_length_sec: u32,

    pub min_min_voters_for_buyout_pct: u16,

    pub min_min_bid_increase_pct: u16,
    pub max_min_bid_increase_pct: u16,

    _reserved: [u8; 2], //needed to align to word size of 8
}

impl Default for KeeprLimits {
    fn default() -> Self {
        KeeprLimits {
            min_min_auction_length_sec: MIN_MIN_AUCTION_LENGTH_SEC,
            max_max_auction_length_sec: MAX_MAX_AUCTION_LENGTH_SEC,
            min_min_voters_for_buyout_pct: MIN_MIN_VOTERS_FOR_BUYOUT_PCT,
            min_min_bid_increase_pct: MIN_MIN_BID_INCREASE_PCT,
            max_min_bid_increase_pct: MAX_MIN_BID_INCREASE_PCT,
            _reserved: [0; 2],
        }
    }
}

pub const LATEST_KEEPR_VERSION: u64 = 0;

#[assert_size(96)]
#[repr(C)]
#[account(zero_copy)]
pub struct Keepr {
    // version of software running on keepr, always inits to latest
    pub version: u64,

    pub flags: u64,

    // controls keepr Config and Flags
    pub master: Pubkey,

    // keeps track of total vault count - can be iterated over to get all vault PDAs
    pub vault_count: u64,

    pub config: KeeprConfig,
    pub limits: KeeprLimits,
}

bitflags::bitflags! {
    pub struct KeeprFlags: u64 {
        const FREEZE_UNLOCKED_VAULTS = 1 << 0;
        const FREEZE_LOCKED_VAULTS = 1 << 1;
        const FREEZE_AUCTIONED_VAULTS = 1 << 2;
        const FREEZE_BOUGHT_OUT_VAULTS = 1 << 3;
        const FREEZE_ALL_VAULTS = Self::FREEZE_UNLOCKED_VAULTS.bits
                                | Self::FREEZE_LOCKED_VAULTS.bits
                                | Self::FREEZE_AUCTIONED_VAULTS.bits
                                | Self::FREEZE_BOUGHT_OUT_VAULTS.bits;
    }
}
