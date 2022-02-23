use anchor_lang::prelude::*;
use gem_bank::{
    self, cpi::accounts::RecordRarityPoints, instructions::RarityConfig, program::GemBank,
};

use crate::state::*;

#[derive(Accounts)]
#[instruction(bump_auth: u8)]
pub struct AddRaritiesToBank<'info> {
    // farm
    #[account(has_one = farm_manager, has_one = farm_authority, has_one = bank)]
    pub farm: Box<Account<'info, Farm>>,
    #[account(mut)]
    pub farm_manager: Signer<'info>,
    /// CHECK:
    #[account(seeds = [farm.key().as_ref()], bump = bump_auth)]
    pub farm_authority: AccountInfo<'info>,

    // cpi
    /// CHECK:
    pub bank: AccountInfo<'info>,
    pub gem_bank: Program<'info, GemBank>,
    pub system_program: Program<'info, System>,
    //
    // remaining accounts can be any number of:
    //   pub gem_mint: Box<Account<'info, Mint>>,
    //   #[account(mut)]
    //   pub gem_rarity: Box<Account<'info, Rarity>>,
}

impl<'info> AddRaritiesToBank<'info> {
    fn add_rarities(&self) -> CpiContext<'_, '_, '_, 'info, RecordRarityPoints<'info>> {
        CpiContext::new(
            self.gem_bank.to_account_info(),
            RecordRarityPoints {
                bank: self.bank.clone(),
                bank_manager: self.farm_authority.clone(),
                payer: self.farm_manager.to_account_info(),
                system_program: self.system_program.to_account_info(),
            },
        )
    }
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, AddRaritiesToBank<'info>>,
    rarity_configs: Vec<RarityConfig>,
) -> Result<()> {
    gem_bank::cpi::record_rarity_points(
        ctx.accounts
            .add_rarities()
            .with_remaining_accounts(ctx.remaining_accounts.to_vec())
            .with_signer(&[&ctx.accounts.farm.farm_seeds()]),
        rarity_configs,
    )
}
