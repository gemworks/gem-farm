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
    #[account(mut, has_one = farm, seeds = [
            b"farmer".as_ref(),
            farm.key().as_ref(),
            identity.key().as_ref(),
        ],
        bump = bump)]
    pub farmer: Box<Account<'info, Farmer>>,
    pub identity: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RefreshFarmer>) -> ProgramResult {
    let farm = &mut ctx.accounts.farm;
    let farmer = &mut ctx.accounts.farmer;
    let now_ts = now_ts()?;

    farm.update_rewards(now_ts, Some(farmer), true)?;

    msg!("{} farmer refreshed", farmer.key());
    Ok(())
}
