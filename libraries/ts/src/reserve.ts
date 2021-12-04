import * as anchor from "@project-serum/anchor";
import { Market as SerumMarket } from "@project-serum/serum";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { DEX_ID, DEX_ID_DEVNET } from ".";
import { JetClient, DerivedAccount } from "./client";
import { JetMarket } from "./market";

export interface ReserveConfig {
  utilizationRate1: number;
  utilizationRate2: number;
  borrowRate0: number;
  borrowRate1: number;
  borrowRate2: number;
  borrowRate3: number;
  minCollateralRatio: number;
  liquidationPremium: number;
  manageFeeCollectionThreshold: anchor.BN;
  manageFeeRate: number;
  loanOriginationFee: number;
  liquidationSlippage: number;
  liquidationDexTradeMax: anchor.BN;
  confidenceThreshold: number;
}

export interface ReserveAccounts {
  vault: DerivedAccount;
  feeNoteVault: DerivedAccount;
  dexSwapTokens: DerivedAccount;
  dexOpenOrders: DerivedAccount;

  loanNoteMint: DerivedAccount;
  depositNoteMint: DerivedAccount;
}

export interface CreateReserveParams {
  /**
   * The Serum market for the reserve.
   */
  dexMarket: PublicKey;

  /**
   * The mint for the token to be stored in the reserve.
   */
  tokenMint: PublicKey;

  /**
   * The Pyth account containing the price information for the reserve token.
   */
  pythOraclePrice: PublicKey;

  /**
   * The Pyth account containing the metadata about the reserve token.
   */
  pythOracleProduct: PublicKey;

  /**
   * The initial configuration for the reserve
   */
  config: ReserveConfig;

  /**
   * The account to use for the reserve data.
   *
   * If not provided an account will be generated.
   */
  account?: Keypair;
}

export interface ReserveData {
  index: number;
  market: PublicKey;
  pythOraclePrice: PublicKey;
  pythOracleProduct: PublicKey;
  tokenMint: PublicKey;
  depositNoteMint: PublicKey;
  loanNoteMint: PublicKey;
  vault: PublicKey;
  feeNoteVault: PublicKey;
  dexOpenOrders: PublicKey;
  dexSwapTokens: PublicKey;
  dexMarket: PublicKey;
}

export interface ReserveDexMarketAccounts {
  market: PublicKey;
  openOrders: PublicKey;
  requestQueue: PublicKey;
  eventQueue: PublicKey;
  bids: PublicKey;
  asks: PublicKey;
  coinVault: PublicKey;
  pcVault: PublicKey;
  vaultSigner: PublicKey;
}

export interface UpdateReserveConfigParams {
  config: ReserveConfig;
  reserve: PublicKey;
  market: PublicKey;
  owner: Keypair;
}

export class JetReserve {
  private conn: Connection;

  constructor(
    private client: JetClient,
    private market: JetMarket,
    public address: PublicKey,
    public data: ReserveData
  ) {
    this.conn = this.client.program.provider.connection;
  }

  async refresh(): Promise<string> {
    let tx = new Transaction().add(this.makeRefreshIx());
    return await this.client.program.provider.send(tx);
  }

  makeRefreshIx(): TransactionInstruction {
    return this.client.program.instruction.refreshReserve({
      accounts: {
        market: this.market.address,
        marketAuthority: this.market.marketAuthority,

        reserve: this.address,
        feeNoteVault: this.data.feeNoteVault,
        depositNoteMint: this.data.depositNoteMint,

        pythOraclePrice: this.data.pythOraclePrice,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
  }

  async loadDexMarketAccounts(): Promise<ReserveDexMarketAccounts> {
    if (this.data.tokenMint.equals(this.market.quoteTokenMint)) {
      // The quote token doesn't have a DEX market
      const defaultAccount = this.data.dexSwapTokens;
      return {
        market: defaultAccount,
        openOrders: defaultAccount,
        requestQueue: defaultAccount,
        eventQueue: defaultAccount,
        bids: defaultAccount,
        asks: defaultAccount,
        coinVault: defaultAccount,
        pcVault: defaultAccount,
        vaultSigner: defaultAccount,
      };
    }

    const dexMarketData = await this.conn.getAccountInfo(this.data.dexMarket);
    const dexMarket = await SerumMarket.getLayout(DEX_ID).decode(
      dexMarketData?.data
    );

    const dexSignerNonce = dexMarket.vaultSignerNonce;
    const vaultSigner = await PublicKey.createProgramAddress(
      [
        dexMarket.ownAddress.toBuffer(),
        dexSignerNonce.toArrayLike(Buffer, "le", 8),
      ],
      this.client.devnet ? DEX_ID_DEVNET : DEX_ID
    );

    return {
      market: dexMarket.ownAddress,
      openOrders: this.data.dexOpenOrders,
      requestQueue: dexMarket.requestQueue,
      eventQueue: dexMarket.eventQueue,
      bids: dexMarket.bids,
      asks: dexMarket.asks,
      coinVault: dexMarket.baseVault,
      pcVault: dexMarket.quoteVault,
      vaultSigner,
    };
  }

  async updateReserveConfig(params: UpdateReserveConfigParams): Promise<void> {
    await this.client.program.rpc.updateReserveConfig(params.config, {
      accounts: {
        market: params.market,
        reserve: params.reserve,
        owner: params.owner.publicKey,
      },
      signers: [params.owner],
    });
  }

  static async load(
    client: JetClient,
    address: PublicKey,
    maybeMarket?: JetMarket
  ): Promise<JetReserve> {
    const data = (await client.program.account.reserve.fetch(
      address
    )) as ReserveData;
    const market = maybeMarket || (await JetMarket.load(client, data.market));

    return new JetReserve(client, market, address, data);
  }

  /**
   * Derive all the associated accounts for a reserve.
   * @param address The reserve address to derive the accounts for.
   * @param tokenMint The address of the mint for the token stored in the reserve.
   * @param market The address of the market the reserve belongs to.
   */
  static async deriveAccounts(
    client: JetClient,
    address: PublicKey,
    tokenMint: PublicKey
  ): Promise<ReserveAccounts> {
    return {
      vault: await client.findDerivedAccount(["vault", address]),
      feeNoteVault: await client.findDerivedAccount(["fee-vault", address]),
      dexSwapTokens: await client.findDerivedAccount([
        "dex-swap-tokens",
        address,
      ]),
      dexOpenOrders: await client.findDerivedAccount([
        "dex-open-orders",
        address,
      ]),

      loanNoteMint: await client.findDerivedAccount([
        "loans",
        address,
        tokenMint,
      ]),
      depositNoteMint: await client.findDerivedAccount([
        "deposits",
        address,
        tokenMint,
      ]),
    };
  }
}
