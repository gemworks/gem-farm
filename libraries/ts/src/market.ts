import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import * as BL from "@solana/buffer-layout";

import { CreateReserveParams, JetReserve } from "./reserve";
import { JetClient, DEX_ID, DEX_ID_DEVNET } from ".";
import * as util from "./util";

const MAX_RESERVES = 32;

const ReserveInfoStruct = BL.struct([
  util.pubkeyField("reserve"),
  BL.blob(80, "_UNUSED_0_"),
  util.numberField("price"),
  util.numberField("depositNoteExchangeRate"),
  util.numberField("loanNoteExchangeRate"),
  BL.blob(72, "_UNUSED_1_"),
]);

const MarketReserveInfoList = BL.seq(ReserveInfoStruct, MAX_RESERVES);

export interface JetMarketReserveInfo {
  address: PublicKey;
  price: anchor.BN;
  depositNoteExchangeRate: anchor.BN;
  loanNoteExchangeRate: anchor.BN;
}

export interface JetMarketData {
  quoteTokenMint: PublicKey;
  quoteCurrency: string;
  marketAuthority: PublicKey;
  owner: PublicKey;

  reserves: JetMarketReserveInfo[];
}

export class JetMarket implements JetMarketData {
  private constructor(
    private client: JetClient,
    public address: PublicKey,
    public quoteTokenMint: PublicKey,
    public quoteCurrency: string,
    public marketAuthority: PublicKey,
    public owner: PublicKey,
    public reserves: JetMarketReserveInfo[]
  ) { }

  private static async fetchData(
    client: JetClient,
    address: PublicKey
  ): Promise<[any, JetMarketReserveInfo[]]> {
    let data: any = await client.program.account.market.fetch(address);
    let reserveInfoData = new Uint8Array(data.reserves);
    let reserveInfoList = MarketReserveInfoList.decode(
      reserveInfoData
    ) as JetMarketReserveInfo[];

    return [data, reserveInfoList];
  }

  /**
   * Load the market account data from the network.
   * @param client The program client
   * @param address The address of the market.
   * @returns An object for interacting with the Jet market.
   */
  static async load(client: JetClient, address: PublicKey): Promise<JetMarket> {
    const [data, reserveInfoList] = await JetMarket.fetchData(client, address);

    return new JetMarket(
      client,
      address,
      data.quoteTokenMint,
      data.quoteCurrency,
      data.marketAuthority,
      data.owner,
      reserveInfoList
    );
  }

  /**
   * Get the latest market account data from the network.
   */
  async refresh(): Promise<void> {
    const [data, reserveInfoList] = await JetMarket.fetchData(
      this.client,
      this.address
    );

    this.reserves = reserveInfoList;
    this.owner = data.owner;
    this.marketAuthority = data.marketAuthority;
    this.quoteCurrency = data.quoteCurrency;
    this.quoteTokenMint = data.quoteTokenMint;
  }

  async setFlags(flags: u64) {
    await this.client.program.rpc.setMarketFlags(flags, {
      accounts: {
        market: this.address,
        owner: this.owner
      }
    });
  }

  async createReserve(params: CreateReserveParams): Promise<JetReserve> {
    let account = params.account;

    if (account == undefined) {
      account = Keypair.generate();
    }

    const derivedAccounts = await JetReserve.deriveAccounts(
      this.client,
      account.publicKey,
      params.tokenMint
    );

    const bumpSeeds = {
      vault: derivedAccounts.vault.bumpSeed,
      feeNoteVault: derivedAccounts.feeNoteVault.bumpSeed,
      dexOpenOrders: derivedAccounts.dexOpenOrders.bumpSeed,
      dexSwapTokens: derivedAccounts.dexSwapTokens.bumpSeed,

      loanNoteMint: derivedAccounts.loanNoteMint.bumpSeed,
      depositNoteMint: derivedAccounts.depositNoteMint.bumpSeed,
    };

    const createReserveAccount =
      await this.client.program.account.reserve.createInstruction(account);

    const dexProgram = this.client.devnet ? DEX_ID_DEVNET : DEX_ID;

    await this.client.program.rpc.initReserve(bumpSeeds, params.config, {
      accounts: {
        market: this.address,
        marketAuthority: this.marketAuthority,
        owner: this.owner,

        oracleProduct: params.pythOracleProduct,
        oraclePrice: params.pythOraclePrice,

        reserve: account.publicKey,
        vault: derivedAccounts.vault.address,
        feeNoteVault: derivedAccounts.feeNoteVault.address,
        dexSwapTokens: derivedAccounts.dexSwapTokens.address,
        dexOpenOrders: derivedAccounts.dexOpenOrders.address,
        loanNoteMint: derivedAccounts.loanNoteMint.address,
        depositNoteMint: derivedAccounts.depositNoteMint.address,

        dexMarket: params.dexMarket,
        quoteTokenMint: this.quoteTokenMint,
        tokenMint: params.tokenMint,

        tokenProgram: TOKEN_PROGRAM_ID,
        dexProgram: this.client.devnet ? DEX_ID_DEVNET : DEX_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      instructions: [createReserveAccount],
      signers: [account],
    });

    return JetReserve.load(this.client, account.publicKey, this);
  }
}

export interface CreateMarketParams {
  /**
   * The address that must sign to make future changes to the market,
   * such as modifying the available reserves (or their configuation)
   */
  owner: PublicKey;

  /**
   * The token mint for the currency being used to quote the value of
   * all other tokens stored in reserves.
   */
  quoteCurrencyMint: PublicKey;

  /**
   * The name of the currency used for quotes, this has to match the
   * name specified in any Pyth/oracle accounts.
   */
  quoteCurrencyName: string;

  /**
   * The account to use for the market data.
   *
   * If not provided an account will be generated.
   */
  account?: Keypair;
}

export enum MarketFlags {
  HaltBorrows = 1 << 0,
  HaltRepays = 1 << 1,
  HaltDeposits = 1 << 2,
  HaltAll = HaltBorrows | HaltRepays | HaltDeposits
}