use anchor_lang::prelude::*;

declare_id!("7W6HbxTxPdZENZjLATJohEcuhethD35fN43Adn6CFQCj");

#[program]
pub mod shardr {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
