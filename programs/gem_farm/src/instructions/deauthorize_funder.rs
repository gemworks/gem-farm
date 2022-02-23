use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct DeauthorizeFunder<'info> {
    // farm
    #[account(mut, has_one = farm_manager)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,

    // funder
    /// CHECK:
    pub funder_to_deauthorize: AccountInfo<'info>,
    #[account(mut, has_one = farm,
        constraint = authorization_proof.authorized_funder == funder_to_deauthorize.key(),
        seeds = [
            b"authorization".as_ref(),
            farm.key().as_ref(),
            funder_to_deauthorize.key().as_ref(),
        ],
        bump = bump)]
    authorization_proof: Box<Account<'info, AuthorizationProof>>,

    // misc
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DeauthorizeFunder>) -> Result<()> {
    // close authorization proof
    close_account(
        &mut ctx.accounts.authorization_proof.to_account_info(),
        &mut ctx.accounts.farm_manager.to_account_info(),
    )?;

    // update farm
    let farm = &mut ctx.accounts.farm;

    farm.authorized_funder_count.try_sub_assign(1)?;

    msg!(
        "funder DEauthorized: {}",
        ctx.accounts.funder_to_deauthorize.key()
    );
    Ok(())
}
