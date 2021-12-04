// SPDX-License-Identifier: AGPL-3.0-or-later

// Copyright (C) 2021 JET PROTOCOL HOLDINGS, LLC.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

//! writer program
//!
//! Utility for writing arbitrary data to accounts.
//! Primarily useful for testing, when mocking account data
//! that would normally be set by some other program/process.

use std::io::Write as IoWrite;

use anchor_lang::prelude::*;

declare_id!("FHgUNcN1YmcY7nxaC9g2Ru47U7944t4wrgnuBiFsKRbM");

#[program]
pub mod test_writer {
    use super::*;

    /// Write data to an account
    pub fn write(ctx: Context<Write>, offset: u64, data: Vec<u8>) -> ProgramResult {
        let account_data = ctx.accounts.target.to_account_info().data;
        let borrow_data = &mut *account_data.borrow_mut();
        let offset = offset as usize;

        Ok((&mut borrow_data[offset..]).write_all(&data[..])?)
    }
}

#[derive(Accounts)]
pub struct Write<'info> {
    #[account(mut, signer)]
    target: AccountInfo<'info>,
}
