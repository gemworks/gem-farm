use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct Rarity {
    //65535 should be enough expressiveness for any nft collection
    pub points: u16,
    //no reserved space coz super scarce space already
}
