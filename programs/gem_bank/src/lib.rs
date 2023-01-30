use anchor_lang::prelude::*;
use instructions::*;

declare_id!("bankHHdqMuaaST4qQk6mkzxGeKPHWmqdgor6Gs8r88m");

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

#[program]
pub mod gem_bank {
    use super::*;

    pub fn init_bank(ctx: Context<InitBank>) -> Result<()> {
        instructions::init_bank::handler(ctx)
    }

    pub fn set_bank_flags(ctx: Context<SetBankFlags>, flags: u32) -> Result<()> {
        instructions::set_bank_flags::handler(ctx, flags)
    }

    pub fn init_vault(ctx: Context<InitVault>, owner: Pubkey, name: String) -> Result<()> {
        instructions::init_vault::handler(ctx, owner, name)
    }

    pub fn set_vault_lock(ctx: Context<SetVaultLock>, vault_lock: bool) -> Result<()> {
        instructions::set_vault_lock::handler(ctx, vault_lock)
    }

    pub fn update_vault_owner(ctx: Context<UpdateVaultOwner>, new_owner: Pubkey) -> Result<()> {
        instructions::update_vault_owner::handler(ctx, new_owner)
    }

    pub fn deposit_gem<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositGem<'info>>,
        _bump_auth: u8,
        _bump_rarity: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_gem::handler(ctx, amount)
    }

    pub fn withdraw_gem(
        ctx: Context<WithdrawGem>,
        _bump_auth: u8,
        _bump_gem_box: u8,
        _bump_gdr: u8,
        _bump_rarity: u8,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_gem::handler(ctx, amount)
    }

    pub fn add_to_whitelist(ctx: Context<AddToWhitelist>, whitelist_type: u8) -> Result<()> {
        instructions::add_to_whitelist::handler(ctx, whitelist_type)
    }

    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>, _bump: u8) -> Result<()> {
        instructions::remove_from_whitelist::handler(ctx)
    }

    pub fn update_bank_manager(ctx: Context<UpdateBankManager>, new_manager: Pubkey) -> Result<()> {
        instructions::update_bank_manager::handler(ctx, new_manager)
    }

    pub fn record_rarity_points<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, RecordRarityPoints<'info>>,
        rarity_configs: Vec<RarityConfig>,
    ) -> Result<()> {
        //msg!("record rarity points");
        instructions::record_rarity_points::handler(ctx, rarity_configs)
    }

    pub fn withdraw_tokens_auth(ctx: Context<WithdrawTokensAuthority>) -> Result<()> {
        instructions::withdraw_tokens_auth::handler(ctx)
    }

    pub fn deposit_gem_pnft<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositGemPnft<'info>>,
        _bump_auth: u8,
        _bump_rarity: u8,
        amount: u64,
        authorization_data: Option<AuthorizationDataLocal>,
        rules_acc_present: bool,
    ) -> Result<()> {
        instructions::deposit_gem_pnft::handler(ctx, amount, authorization_data, rules_acc_present)
    }

    pub fn withdraw_gem_pnft<'info>(
        ctx: Context<'_, '_, '_, 'info, WithdrawGemPnft<'info>>,
        _bump_auth: u8,
        _bump_gem_box: u8,
        _bump_gdr: u8,
        _bump_rarity: u8,
        amount: u64,
        authorization_data: Option<AuthorizationDataLocal>,
        rules_acc_present: bool,
    ) -> Result<()> {
        instructions::withdraw_gem_pnft::handler(ctx, amount, authorization_data, rules_acc_present)
    }
}
