use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct RefreshFarmer<'info> {
    // farm
    #[account(mut)]
    pub farm: Box<Account<'info, Farm>>,

    // farmer
    #[account(mut, has_one = farm, has_one = identity, seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump)]
    pub farmer: Box<Account<'info, Farmer>>,
    //not a signer intentionally
    /// CHECK:
    pub identity: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RefreshFarmer>) -> Result<()> {
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;
    let now_ts = now_ts()?;

    farm.update_rewards(now_ts, Some(farmer), true)?;

    msg!("{} farmer refreshed", farmer.key());
    Ok(())
}
