use anchor_lang::prelude::*;
use gem_common::errors::ErrorCode;

use crate::state::*;

#[derive(Accounts)]
pub struct SetVaultLock<'info> {
    // bank
    #[account(has_one = bank_manager)]
    pub bank: Box<Account<'info, Bank>>,
    // vaults are locked / unlocked by THE MANAGER
    // (depositing / withdrawing doesn't require them)
    pub bank_manager: Signer<'info>,

    // vault
    // not doing PDA verification because passing in creator tedious
    // this ix is designed for BM to execute, who by defn can pass in any vault
    #[account(mut, has_one = bank)]
    pub vault: Box<Account<'info, Vault>>,
}

pub fn handler(ctx: Context<SetVaultLock>, vault_locked: bool) -> Result<()> {
    let bank = &ctx.accounts.bank;
    let vault = &mut ctx.accounts.vault;

    if Bank::read_flags(bank.flags)?.contains(BankFlags::FREEZE_VAULTS) {
        return Err(error!(ErrorCode::VaultAccessSuspended));
    }

    vault.locked = vault_locked;

    // msg!("vault {} lock set to {}", vault.key(), vault_locked);
    Ok(())
}
