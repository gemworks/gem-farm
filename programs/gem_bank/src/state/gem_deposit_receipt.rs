use anchor_lang::prelude::*;

/// GDR is necessary to locate all gem boxes for a given bank/vault
/// see fetchAllGdrPDAs() in TS client
#[proc_macros::assert_size(136)]
#[repr(C)]
#[account]
pub struct GemDepositReceipt {
    /// each gem gox sits inside a single vault
    pub vault: Pubkey,

    /// the token account that actually holds the deposited gem(s)
    pub gem_box_address: Pubkey,

    /// the following is really stored for convenience, so we don't have to fetch gem account separately
    pub gem_mint: Pubkey,

    /// number of gems deposited into this GDR
    /// in theory, if each gem is actually an NFT this number would be 1
    /// but the vault is generic enough to support fungible tokens as well, so this can be >1
    pub gem_count: u64,

    /// reserved for future updates, has to be /8
    _reserved: [u8; 32],
}
