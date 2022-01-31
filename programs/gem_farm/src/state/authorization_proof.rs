use anchor_lang::prelude::*;

/// if this PDA exists, this means the funder recorded below has been authorized by the
/// farm recorded below to fund rewards
#[proc_macros::assert_size(96)]
#[repr(C)]
#[account]
pub struct AuthorizationProof {
    pub authorized_funder: Pubkey,

    pub farm: Pubkey,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}
