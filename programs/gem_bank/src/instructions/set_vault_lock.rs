use anchor_lang::prelude::*;
use gem_common::errors::ErrorCode;

use crate::state::*;

#[derive(Accounts)]
pub struct UnlockVault<'info> {
    // needed for checking flags
    pub bank: Account<'info, Bank>,
    #[account(mut, has_one = bank, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

pub fn handler(ctx: Context<UnlockVault>, vault_locked: bool) -> ProgramResult {
    let bank = &ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    if Bank::read_flags(bank.flags)?.contains(BankFlags::FREEZE_VAULTS) {
        return Err(ErrorCode::VaultAccessSuspended.into());
    }

    vault.locked = vault_locked;

    msg!("vault {} lock set to {}", vault.key(), vault_locked);
    Ok(())
}
