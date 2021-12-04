use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct InitShardr<'info> {
    // considered making this a PDA derived from master, but then can't update master in the future
    #[account(init, payer = master, space = 8 + std::mem::size_of::<Shardr>())]
    pub shardr: AccountLoader<'info, Shardr>,
    #[account(mut)]
    pub master: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitShardr>, config: ShardrConfig) -> ProgramResult {
    let mut shardr = ctx.accounts.shardr.load_init()?;

    shardr.version = LATEST_SHARDR_VERSION;
    shardr.master = ctx.accounts.master.key();
    shardr.vault_count = 0;
    shardr.config = config;
    shardr.limits = ShardrLimits::default();

    msg!("shardr initialized, running {}", shardr.version);

    Ok(())
}
