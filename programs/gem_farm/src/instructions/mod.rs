pub mod add_rarities_to_bank;
pub mod add_to_bank_whitelist;
pub mod authorize_funder;
pub mod cancel_reward;
pub mod claim;
pub mod deauthorize_funder;
pub mod flash_deposit;
pub mod fund_reward;
pub mod init_farm;
pub mod init_farmer;
pub mod lock_reward;
pub mod refresh_farmer;
pub mod refresh_farmer_signed;
pub mod remove_from_bank_whitelist;
pub mod stake;
pub mod treasury_payout;
pub mod unstake;
pub mod update_farm;

pub use add_rarities_to_bank::*;
pub use add_to_bank_whitelist::*;
pub use authorize_funder::*;
pub use cancel_reward::*;
pub use claim::*;
pub use deauthorize_funder::*;
pub use flash_deposit::*;
pub use fund_reward::*;
pub use init_farm::*;
pub use init_farmer::*;
pub use lock_reward::*;
pub use refresh_farmer::*;
pub use refresh_farmer_signed::*;
pub use remove_from_bank_whitelist::*;
pub use stake::*;
pub use treasury_payout::*;
pub use unstake::*;
pub use update_farm::*;

// have to duplicate or this won't show up in IDL
use anchor_lang::prelude::*;
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq)]
pub struct RarityConfig {
    pub mint: Pubkey,
    pub rarity_points: u16,
}
