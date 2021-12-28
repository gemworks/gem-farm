use anchor_lang::prelude::*;

/// if this PDA exists, this means the funder recorded below has been authorized by the
/// farm recorded below to fund rewards
#[repr(C)]
#[account]
pub struct AuthorizationProof {
    pub authorized_funder: Pubkey,

    pub farm: Pubkey,
}
