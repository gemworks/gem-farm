import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { AccountInfo } from '@solana/spl-token';
import { AccountUtils } from '../utils/account';
import { GemBank } from '../../target/types/gem_bank';
import { Idl, Program, Provider, Wallet } from '@project-serum/anchor';
import { Connection } from '@metaplex/js';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export class GemBankUtils extends AccountUtils {
  provider: anchor.Provider;
  program: anchor.Program<GemBank>;

  constructor(
    conn: Connection,
    wallet: Wallet,
    idl?: Idl,
    programId?: PublicKey
  ) {
    super(conn, wallet);
    this.provider = new Provider(conn, wallet, Provider.defaultOptions());
    anchor.setProvider(this.provider);
    if (idl && programId) {
      //means running in prod
      this.program = new anchor.Program<GemBank>(
        idl as any,
        programId,
        this.provider
      );
    } else {
      //means running inside test suite
      this.program = anchor.workspace.GemBank as Program<GemBank>;
    }
  }

  // --------------------------------------- fetch deserialized accounts

  async fetchBankAcc(bank: PublicKey) {
    return this.program.account.bank.fetch(bank);
  }

  async fetchVaultAcc(vault: PublicKey) {
    return this.program.account.vault.fetch(vault);
  }

  async fetchGDRAcc(GDR: PublicKey) {
    return this.program.account.gemDepositReceipt.fetch(GDR);
  }

  async fetchGemAcc(mint: PublicKey, gemAcc: PublicKey): Promise<AccountInfo> {
    return this.deserializeTokenAccount(mint, gemAcc);
  }

  // --------------------------------------- find PDA addresses

  async findVaultPDA(bank: PublicKey, creator: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'vault',
      bank,
      creator,
    ]);
  }

  async findGemBoxPDA(vault: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'gem_box',
      vault,
      mint,
    ]);
  }

  async findGdrPDA(vault: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'gem_deposit_receipt',
      vault,
      mint,
    ]);
  }

  async findVaultAuthorityPDA(vault: PublicKey) {
    return this.findProgramAddress(this.program.programId, [vault]);
  }

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  async fetchAllBankPDAs(manager?: PublicKey) {
    const filter = manager
      ? [
          {
            memcmp: {
              offset: 24, //need to prepend 8 bytes for anchor's disc
              bytes: manager.toBase58(),
            },
          },
        ]
      : [];
    const pdas = await this.program.account.bank.all(filter);
    console.log(`found a total of ${pdas.length} bank PDAs`);
    return pdas;
  }

  async fetchAllVaultPDAs(bank?: PublicKey) {
    const filter = bank
      ? [
          {
            memcmp: {
              offset: 8, //need to prepend 8 bytes for anchor's disc
              bytes: bank.toBase58(),
            },
          },
        ]
      : [];
    const pdas = await this.program.account.vault.all(filter);
    console.log(`found a total of ${pdas.length} vault PDAs`);
    return pdas;
  }

  async fetchAllGdrPDAs(vault?: PublicKey) {
    const filter = vault
      ? [
          {
            memcmp: {
              offset: 8, //need to prepend 8 bytes for anchor's disc
              bytes: vault.toBase58(),
            },
          },
        ]
      : [];
    const pdas = await this.program.account.gemDepositReceipt.all(filter);
    console.log(`found a total of ${pdas.length} GDR PDAs`);
    return pdas;
  }
}
