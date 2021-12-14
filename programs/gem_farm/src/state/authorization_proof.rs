use anchor_lang::prelude::*;

#[repr(C)]
#[account]
pub struct AuthorizationProof {
    pub authorized_funder: Pubkey,

    pub farm: Pubkey,
}
