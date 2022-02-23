use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8, bump_treasury: u8)]
pub struct TreasuryPayout<'info> {
    // farm
    #[account(mut, has_one = farm_authority, has_one = farm_manager, has_one = farm_treasury)]
    pub farm: Box<Account<'info, Farm>>,
    pub farm_manager: Signer<'info>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(mut, seeds = [b"treasury".as_ref(), farm.key().as_ref()], bump = bump_treasury)]
    pub farm_treasury: AccountInfo<'info>,

    // destination
    /// CHECK:
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    // misc
    pub system_program: Program<'info, System>,
}

impl<'info> TreasuryPayout<'info> {
    fn payout_from_treasury(&self, bump_treasury: u8, lamports: u64) -> Result<()> {
        invoke_signed(
            &system_instruction::transfer(self.farm_treasury.key, self.destination.key, lamports),
            &[
                self.farm_treasury.to_account_info(),
                self.destination.clone(),
                self.system_program.to_account_info(),
            ],
            &[&[
                b"treasury".as_ref(),
                self.farm.key().as_ref(),
                &[bump_treasury],
            ]],
        )
        .map_err(Into::into)
    }
}

pub fn handler(ctx: Context<TreasuryPayout>, bump: u8, lamports: u64) -> Result<()> {
    ctx.accounts.payout_from_treasury(bump, lamports)?;

    msg!("{} lamports paid out from treasury", lamports);
    Ok(())
}
