import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

import { Amount, DEX_ID, DEX_ID_DEVNET } from ".";
import { DerivedAccount, JetClient } from "./client";
import { JetMarket, JetMarketReserveInfo } from "./market";
import {
  AccountLayout as TokenAccountLayout,
  AccountInfo as TokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { JetReserve } from "./reserve";

export class TokenAmount {
  constructor(public mint: PublicKey, public amount: anchor.BN) {}
}

export interface User {
  address: PublicKey;

  deposits(): TokenAmount[];

  collateral(): TokenAmount[];

  /**
   * Get the loans held by the user
   */
  loans(): TokenAmount[];
}

export class JetUser implements User {
  private _deposits: TokenAmount[] = [];
  private _collateral: TokenAmount[] = [];
  private _loans: TokenAmount[] = [];

  private conn: Connection;

  private constructor(
    private client: JetClient,
    public market: JetMarket,
    public address: PublicKey,
    private obligation: DerivedAccount
  ) {
    this.conn = this.client.program.provider.connection;
  }

  static async load(
    client: JetClient,
    market: JetMarket,
    address: PublicKey
  ): Promise<JetUser> {
    const obligationAccount = await client.findDerivedAccount([
      "obligation",
      market.address,
      address,
    ]);
    const user = new JetUser(client, market, address, obligationAccount);

    user.refresh();
    return user;
  }

  async liquidateDex(
    loanReserve: JetReserve,
    collateralReserve: JetReserve
  ): Promise<string> {
    const tx = await this.makeLiquidateDexTx(loanReserve, collateralReserve);
    return await this.client.program.provider.send(tx);
  }

  async makeLiquidateDexTx(
    loanReserve: JetReserve,
    collateralReserve: JetReserve
  ): Promise<Transaction> {
    const loanDexAccounts = await loanReserve.loadDexMarketAccounts();
    const collateralDexAccounts =
      await collateralReserve.loadDexMarketAccounts();
    const loanAccounts = await this.findReserveAccounts(loanReserve);
    const collateralAccounts = await this.findReserveAccounts(
      collateralReserve
    );

    const tx = new Transaction();

    tx.add(loanReserve.makeRefreshIx());
    tx.add(collateralReserve.makeRefreshIx());

    tx.add(
      this.client.program.instruction.liquidateDex({
        accounts: {
          sourceMarket: collateralDexAccounts,
          targetMarket: loanDexAccounts,

          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          obligation: this.obligation.address,

          loanReserve: loanReserve.address,
          loanReserveVault: loanReserve.data.vault,
          loanNoteMint: loanReserve.data.loanNoteMint,
          loanAccount: loanAccounts.loan.address,

          collateralReserve: collateralReserve.address,
          collateralReserveVault: collateralReserve.data.vault,
          depositNoteMint: collateralReserve.data.depositNoteMint,
          collateralAccount: collateralAccounts.collateral.address,

          dexSwapTokens: loanReserve.data.dexSwapTokens,
          dexProgram: this.client.devnet ? DEX_ID_DEVNET : DEX_ID,

          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY
        },
      })
    );

    return tx;
  }

  async liquidate(
    loanReserve: JetReserve,
    collateralReserve: JetReserve,
    payerAccount: PublicKey,
    receiverAccount: PublicKey,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeLiquidateTx(
      loanReserve,
      collateralReserve,
      payerAccount,
      receiverAccount,
      amount
    );
    return await this.client.program.provider.send(tx);
  }

  async makeLiquidateTx(
    _loanReserve: JetReserve,
    _collateralReserve: JetReserve,
    _payerAccount: PublicKey,
    _receiverAccount: PublicKey,
    _amount: Amount
  ): Promise<Transaction> {
    throw new Error("not yet implemented");
  }

  async repay(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeRepayTx(reserve, tokenAccount, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeRepayTx(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<Transaction> {
    const accounts = await this.findReserveAccounts(reserve);
    const tx = new Transaction();

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.repay(amount, {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          payer: this.address,

          reserve: reserve.address,
          vault: reserve.data.vault,
          obligation: this.obligation.address,
          loanNoteMint: reserve.data.loanNoteMint,
          loanAccount: accounts.loan.address,
          payerAccount: tokenAccount,

          tokenProgram: TOKEN_PROGRAM_ID,
        },
      })
    );

    return tx;
  }

  async withdrawCollateral(
    reserve: JetReserve,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeWithdrawCollateralTx(reserve, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeWithdrawCollateralTx(
    reserve: JetReserve,
    amount: Amount
  ): Promise<Transaction> {
    const accounts = await this.findReserveAccounts(reserve);
    const bumpSeeds = {
      collateralAccount: accounts.collateral.bumpSeed,
      depositAccount: accounts.deposits.bumpSeed,
    };
    const tx = new Transaction();

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.withdrawCollateral(bumpSeeds, amount, {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          owner: this.address,
          obligation: this.obligation.address,

          reserve: reserve.address,
          collateralAccount: accounts.collateral.address,
          depositAccount: accounts.deposits.address,

          tokenProgram: TOKEN_PROGRAM_ID,
        },
      })
    );

    return tx;
  }

  async withdraw(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeWithdrawTx(reserve, tokenAccount, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeWithdrawTx(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<Transaction> {
    const accounts = await this.findReserveAccounts(reserve);
    const tx = new Transaction();

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.withdraw(
        accounts.deposits.bumpSeed,
        amount,
        {
          accounts: {
            market: this.market.address,
            marketAuthority: this.market.marketAuthority,

            withdrawAccount: tokenAccount,
            depositAccount: accounts.deposits.address,
            depositor: this.address,

            reserve: reserve.address,
            vault: reserve.data.vault,
            depositNoteMint: reserve.data.depositNoteMint,

            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      )
    );

    return tx;
  }

  async deposit(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeDepositTx(reserve, tokenAccount, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeDepositTx(
    reserve: JetReserve,
    tokenAccount: PublicKey,
    amount: Amount
  ): Promise<Transaction> {
    const accounts = await this.findReserveAccounts(reserve);
    const depositAccountInfo = await this.conn.getAccountInfo(
      accounts.deposits.address
    );

    const tx = new Transaction();

    if (depositAccountInfo == null) {
      tx.add(this.makeInitDepositAccountIx(reserve, accounts.deposits));
    }

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.deposit(
        accounts.deposits.bumpSeed,
        amount,
        {
          accounts: {
            market: this.market.address,
            marketAuthority: this.market.marketAuthority,

            depositSource: tokenAccount,
            depositAccount: accounts.deposits.address,
            depositor: this.address,

            reserve: reserve.address,
            vault: reserve.data.vault,
            depositNoteMint: reserve.data.depositNoteMint,

            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }
      )
    );

    return tx;
  }

  async depositCollateral(
    reserve: JetReserve,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeDepositCollateralTx(reserve, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeDepositCollateralTx(reserve: JetReserve, amount: Amount) {
    const accounts = await this.findReserveAccounts(reserve);
    const obligationAccountInfo = await this.conn.getAccountInfo(
      this.obligation.address
    );
    const collateralAccountInfo = await this.conn.getAccountInfo(
      accounts.collateral.address
    );

    const tx = new Transaction();

    if (obligationAccountInfo == null) {
      tx.add(this.makeInitObligationAccountIx());
    }
    if (collateralAccountInfo == null) {
      tx.add(this.makeInitCollateralAccountIx(reserve, accounts.collateral));
    }

    const bumpSeeds = {
      depositAccount: accounts.deposits.bumpSeed,
      collateralAccount: accounts.collateral.bumpSeed,
    };

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.depositCollateral(bumpSeeds, amount, {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          obligation: this.obligation.address,
          depositAccount: accounts.deposits.address,
          collateralAccount: accounts.collateral.address,
          owner: this.address,

          reserve: reserve.address,
          noteMint: reserve.data.depositNoteMint,

          tokenProgram: TOKEN_PROGRAM_ID,
        },
      })
    );

    return tx;
  }

  async borrow(
    reserve: JetReserve,
    receiver: PublicKey,
    amount: Amount
  ): Promise<string> {
    const tx = await this.makeBorrowTx(reserve, receiver, amount);
    return await this.client.program.provider.send(tx);
  }

  async makeBorrowTx(reserve: JetReserve, receiver: PublicKey, amount: Amount) {
    const accounts = await this.findReserveAccounts(reserve);
    const loanAccountInfo = await this.conn.getAccountInfo(
      accounts.loan.address
    );

    const tx = new Transaction();

    if (loanAccountInfo == null) {
      tx.add(this.makeInitLoanAccountIx(reserve, accounts.loan));
    }

    tx.add(reserve.makeRefreshIx());
    tx.add(
      this.client.program.instruction.borrow(accounts.loan.bumpSeed, amount, {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          reserve: reserve.address,
          obligation: this.obligation.address,
          vault: reserve.data.vault,
          loanNoteMint: reserve.data.loanNoteMint,
          borrower: this.address,
          loanAccount: accounts.loan.address,

          receiverAccount: receiver,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      })
    );

    return tx;
  }

  private makeInitDepositAccountIx(
    reserve: JetReserve,
    account: DerivedAccount
  ): TransactionInstruction {
    return this.client.program.instruction.initDepositAccount(
      account.bumpSeed,
      {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          reserve: reserve.address,
          depositNoteMint: reserve.data.depositNoteMint,

          depositor: this.address,
          depositAccount: account.address,

          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        },
      }
    );
  }

  private makeInitCollateralAccountIx(
    reserve: JetReserve,
    account: DerivedAccount
  ): TransactionInstruction {
    return this.client.program.instruction.initCollateralAccount(
      account.bumpSeed,
      {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          reserve: reserve.address,
          depositNoteMint: reserve.data.depositNoteMint,
          owner: this.address,
          obligation: this.obligation.address,
          collateralAccount: account.address,

          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        },
      }
    );
  }

  private makeInitLoanAccountIx(
    reserve: JetReserve,
    account: DerivedAccount
  ): TransactionInstruction {
    return this.client.program.instruction.initLoanAccount(account.bumpSeed, {
      accounts: {
        market: this.market.address,
        marketAuthority: this.market.marketAuthority,

        reserve: reserve.address,
        loanNoteMint: reserve.data.loanNoteMint,
        owner: this.address,
        obligation: this.obligation.address,
        loanAccount: account.address,

        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      },
    });
  }

  private makeInitObligationAccountIx(): TransactionInstruction {
    return this.client.program.instruction.initObligation(
      this.obligation.bumpSeed,
      {
        accounts: {
          market: this.market.address,
          marketAuthority: this.market.marketAuthority,

          obligation: this.obligation.address,
          borrower: this.address,

          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
      }
    );
  }

  async refresh() {
    this._loans = [];
    this._deposits = [];
    this._collateral = [];

    for (const reserve of this.market.reserves) {
      await this.refreshReserve(reserve);
    }
  }

  private async refreshReserve(reserve: JetMarketReserveInfo) {
    const accounts = await this.findReserveAccounts(reserve);

    await this.refreshAccount(this._deposits, accounts.deposits);
    await this.refreshAccount(this._loans, accounts.loan);
    await this.refreshAccount(this._collateral, accounts.collateral);
  }

  private async refreshAccount(
    appendTo: TokenAmount[],
    account: DerivedAccount
  ) {
    try {
      const info = await this.conn.getAccountInfo(account.address);
      const tokenAccount: TokenAccount = TokenAccountLayout.decode(info.data);

      appendTo.push({
        mint: tokenAccount.mint,
        amount: tokenAccount.amount,
      });
    } catch (e) {
      // ignore error, which should mean it's an invalid/uninitialized account
    }
  }

  private async findReserveAccounts(
    reserve: JetMarketReserveInfo | JetReserve
  ): Promise<UserReserveAccounts> {
    const deposits = await this.client.findDerivedAccount([
      "deposits",
      reserve.address,
      this.address,
    ]);
    const loan = await this.client.findDerivedAccount([
      "loan",
      reserve.address,
      this.obligation.address,
      this.address,
    ]);
    const collateral = await this.client.findDerivedAccount([
      "collateral",
      reserve.address,
      this.obligation.address,
      this.address,
    ]);

    return {
      deposits,
      loan,
      collateral,
    };
  }

  /**
   * Get all the deposits held by the user, excluding those amounts being
   * used as collateral for a loan.
   */
  deposits() {
    return this._deposits;
  }

  /**
   * Get all the collateral deposits held by the user.
   */
  collateral() {
    return this._collateral;
  }

  /**
   * Get the loans held by the user
   */
  loans() {
    return this._loans;
  }
}

/**
 * The set of accounts that can be derived for a user, for each reserve in a market.
 */
interface UserReserveAccounts {
  deposits: DerivedAccount;
  loan: DerivedAccount;
  collateral: DerivedAccount;
}
