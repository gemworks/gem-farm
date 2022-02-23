use anchor_lang::prelude::*;
use gem_common::errors::ErrorCode;

/// whitelists are used to control what gems can/can't go into the vault
/// currently 2 types of vault lists are supported: by mint and by creator
/// if the whitelist PDA exists, then the mint/creator is considered accepted
/// if at least 1 whitelist PDA exists total, then all deposit attempts will start getting checked
#[repr(C)]
#[account]
pub struct WhitelistProof {
    pub whitelist_type: u8,

    pub whitelisted_address: Pubkey,

    pub bank: Pubkey,
    //no reserved space coz super scarce space already
}

impl WhitelistProof {
    pub fn read_type(whitelist_type: u8) -> Result<WhitelistType> {
        WhitelistType::from_bits(whitelist_type).ok_or(error!(ErrorCode::InvalidParameter))
    }

    pub fn reset_type(&mut self, whitelist_type: WhitelistType) {
        self.whitelist_type = whitelist_type.bits();
    }

    pub fn contains_type(&self, expected_whitelist_type: WhitelistType) -> Result<()> {
        let whitelist_type = WhitelistProof::read_type(self.whitelist_type)?;
        if whitelist_type.contains(expected_whitelist_type) {
            // msg!(
            //     "whitelist type ({:?}) matches, going ahead",
            //     expected_whitelist_type
            // );
            return Ok(());
        }

        Err(error!(ErrorCode::WrongWhitelistType))
    }
}

bitflags::bitflags! {
    pub struct WhitelistType: u8 {
        const CREATOR = 1 << 0;
        const MINT = 1 << 1;
    }
}
