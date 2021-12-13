use std::io::Write;

use anchor_lang::{__private::CLOSED_ACCOUNT_DISCRIMINATOR, prelude::*};

use crate::{errors::ErrorCode, math::*};

pub fn close_account(
    pda_to_close: &mut AccountInfo,
    sol_destination: &mut AccountInfo,
) -> ProgramResult {
    // Transfer tokens from the account to the sol_destination.
    let dest_starting_lamports = sol_destination.lamports();
    **sol_destination.lamports.borrow_mut() =
        dest_starting_lamports.try_add(pda_to_close.lamports())?;
    **pda_to_close.lamports.borrow_mut() = 0;

    // Mark the account discriminator as closed.
    let mut data = pda_to_close.try_borrow_mut_data()?;
    let dst: &mut [u8] = &mut data;
    let mut cursor = std::io::Cursor::new(dst);
    cursor
        .write_all(&CLOSED_ACCOUNT_DISCRIMINATOR)
        .map_err(|_| ErrorCode::AccountDidNotSerialize)?;
    Ok(())
}
