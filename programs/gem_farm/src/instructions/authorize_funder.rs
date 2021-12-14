use anchor_lang::prelude::*;
use gem_common::*;

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct AuthorizeFunder<'info> {
    #[account(mut, has_one = farm_manager)]
    pub farm: Account<'info, Farm>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    pub funder_to_authorize: AccountInfo<'info>,
    #[account(init_if_needed,
        seeds = [
            b"authorization".as_ref(),
            farm.key().as_ref(),
            funder_to_authorize.key().as_ref(),
        ],
        bump = bump,
        payer = farm_manager,
        space = 8 + std::mem::size_of::<AuthorizationProof>())]
    authorization_proof: Account<'info, AuthorizationProof>,
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AuthorizeFunder>) -> ProgramResult {
    // create/update authorization proof
    let proof = &mut ctx.accounts.authorization_proof;
    proof.authorized_funder = ctx.accounts.funder_to_authorize.key();
    proof.farm = ctx.accounts.farm.key();

    // increment authorized funder count on bank
    let farm = &mut ctx.accounts.farm;
    farm.authorized_funder_count.try_self_add(1);

    msg!(
        "funded authorized: {}",
        ctx.accounts.funder_to_authorize.key()
    );
    Ok(())
}
