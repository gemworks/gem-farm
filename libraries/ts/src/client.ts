import { PublicKey, Keypair } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';

import { JET_ID } from '.';
import { CreateMarketParams, JetMarket } from './market';

export class DerivedAccount {
  public address: PublicKey;
  public bumpSeed: number;

  constructor(address: PublicKey, bumpSeed: number) {
    this.address = address;
    this.bumpSeed = bumpSeed;
  }
}

interface ToBytes {
  toBytes(): Uint8Array;
}

interface HasPublicKey {
  publicKey: PublicKey;
}

type DerivedAccountSeed = HasPublicKey | ToBytes | Uint8Array | string;

export class JetClient {
  constructor(public program: anchor.Program, public devnet?: boolean) {}

  /**
   * Create a new client for interacting with the Jet lending program.
   * @param provider The provider with wallet/network access that can be used to send transactions.
   * @returns The client
   */
  static async connect(provider: anchor.Provider, devnet?: boolean): Promise<JetClient> {
    const idl = await anchor.Program.fetchIdl(JET_ID, provider);
    const program = new anchor.Program(idl, JET_ID, provider);

    return new JetClient(program, devnet);
  }

  /**
   * Find a PDA
   * @param seeds 
   * @returns 
   */
  async findDerivedAccount(
    seeds: DerivedAccountSeed[]
  ): Promise<DerivedAccount> {
    const seedBytes = seeds.map((s) => {
      if (typeof s == "string") {
        return Buffer.from(s);
      } else if ("publicKey" in s) {
        return s.publicKey.toBytes();
      } else if ("toBytes" in s) {
        return s.toBytes();
      } else {
        return s;
      }
    });
    const [address, bumpSeed] = await PublicKey.findProgramAddress(
      seedBytes,
      this.program.programId
    );
    return new DerivedAccount(address, bumpSeed);
  }

  async createMarket(params: CreateMarketParams): Promise<JetMarket> {
    let account = params.account;

    if (account == undefined) {
      account = Keypair.generate();
    }

    await this.program.rpc.initMarket(
      params.owner,
      params.quoteCurrencyName,
      params.quoteCurrencyMint,
      {
        accounts: {
          market: account.publicKey,
        },
        signers: [account],
        instructions: [
          await this.program.account.market.createInstruction(account),
        ],
      }
    );

    return JetMarket.load(this, account.publicKey);
  }
}
