use anchor_lang::prelude::*;

use crate::state::*;

#[derive(Accounts)]
pub struct UpdateFarm<'info> {
    // farm
    #[account(mut, has_one = farm_manager)]
    pub farm: Box<Account<'info, Farm>>,
    pub farm_manager: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateFarm>,
    config: Option<FarmConfig>,
    manager: Option<Pubkey>,
) -> Result<()> {
    let farm = &mut ctx.accounts.farm;

    if let Some(config) = config {
        farm.config = config;
    }

    if let Some(manager) = manager {
        farm.farm_manager = manager;
    }

    msg!("updated farm");
    Ok(())
}
