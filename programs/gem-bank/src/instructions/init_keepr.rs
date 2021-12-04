use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitKeepr<'info> {
    // considered making this a PDA derived from master, but then can't update master in the future
    #[account(init, payer = master, space = 8 + std::mem::size_of::<Keepr>())]
    pub keepr: AccountLoader<'info, Keepr>,
    #[account(mut)]
    pub master: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitKeepr>, config: KeeprConfig) -> ProgramResult {
    let mut keepr = ctx.accounts.keepr.load_init()?;

    keepr.version = LATEST_KEEPR_VERSION;
    keepr.master = ctx.accounts.master.key();
    keepr.vault_count = 0;
    keepr.config = config;
    keepr.limits = KeeprLimits::default();

    msg!("keepr initialized, running {}", keepr.version);

    Ok(())
}
