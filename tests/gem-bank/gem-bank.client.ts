import * as anchor from '@project-serum/anchor';
import { BN, Idl, Program, Provider, Wallet } from '@project-serum/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  AccountInfo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AccountUtils } from '../utils/account';
import { GemBank } from '../../target/types/gem_bank';
import { Connection } from '@solana/web3.js';
import { isKp } from '../utils/types';
import { MetadataProgram } from '@metaplex-foundation/mpl-token-metadata';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export class GemBankClient extends AccountUtils {
  provider: anchor.Provider;
  program!: anchor.Program<GemBank>;

  constructor(
    conn: Connection,
    wallet: Wallet,
    idl?: Idl,
    programId?: PublicKey
  ) {
    super(conn, wallet);
    this.provider = new Provider(conn, wallet, Provider.defaultOptions());
    anchor.setProvider(this.provider);
    this.setProgram(idl, programId);
  }

  setProgram(idl?: Idl, programId?: PublicKey) {
    //instantiating program depends on the environment
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
              offset: 8, //need to prepend 8 bytes for anchor's disc
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

  // --------------------------------------- execute ixs

  async startBank(bank: Keypair, manager: PublicKey | Keypair) {
    const signers = [bank];
    if (isKp(manager)) signers.push(<Keypair>manager);

    console.log('starting bank at', bank.publicKey.toBase58());
    const txSig = await this.program.rpc.initBank({
      accounts: {
        bank: bank.publicKey,
        manager: isKp(manager) ? (<Keypair>manager).publicKey : manager,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { txSig };
  }

  async createVault(
    bank: PublicKey,
    creator: PublicKey | Keypair,
    owner: PublicKey,
    name: string
  ) {
    const creatorPk = isKp(creator)
      ? (<Keypair>creator).publicKey
      : <PublicKey>creator;
    const [vault, vaultBump] = await this.findVaultPDA(bank, creatorPk);
    const [vaultAuth] = await this.findVaultAuthorityPDA(vault);

    const signers = [];
    if (isKp(creator)) signers.push(<Keypair>creator);

    console.log('creating vault at', vault.toBase58());
    const txSig = await this.program.rpc.initVault(vaultBump, owner, name, {
      accounts: {
        bank,
        vault,
        creator: creatorPk,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { vault, vaultBump, vaultAuth, txSig };
  }

  async updateVaultOwner(
    bank: PublicKey,
    vault: PublicKey,
    existingOwner: Keypair | PublicKey,
    newOwner: PublicKey
  ) {
    const signers = [];
    if (isKp(existingOwner)) signers.push(<Keypair>existingOwner);

    console.log('updating vault owner to', newOwner.toBase58());
    const txSig = await this.program.rpc.updateVaultOwner(newOwner, {
      accounts: {
        bank,
        vault,
        owner: isKp(existingOwner)
          ? (<Keypair>existingOwner).publicKey
          : existingOwner,
      },
      signers,
    });

    return { txSig };
  }

  async setVaultLock(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    vaultLocked: boolean
  ) {
    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    console.log('setting vault lock to', vaultLocked);
    const txSig = await this.program.rpc.setVaultLock(vaultLocked, {
      accounts: {
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
      },
      signers,
    });

    return { txSig };
  }

  async setBankFlags(
    bank: PublicKey,
    manager: PublicKey | Keypair,
    flags: number
  ) {
    const signers = [];
    if (isKp(manager)) signers.push(<Keypair>manager);

    console.log('setting bank flags to', flags);
    const txSig = await this.program.rpc.setBankFlags(flags, {
      accounts: {
        bank,
        manager: manager ? (<Keypair>manager).publicKey : manager,
      },
      signers,
    });

    return { txSig };
  }

  async depositGem(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    gemSource: PublicKey,
    gemMetadata: PublicKey,
    depositor: PublicKey | Keypair
  ) {
    const [gemBox, gemBump] = await this.findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await this.findGdrPDA(vault, gemMint);
    const [vaultAuth] = await this.findVaultAuthorityPDA(vault);

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);
    if (isKp(depositor)) signers.push(<Keypair>depositor);

    console.log(
      `depositing ${gemAmount} gems into ${gemBox.toBase58()}, GDR ${GDR.toBase58()}`
    );
    const txSig = await this.program.rpc.depositGem(
      gemBump,
      GDRBump,
      gemAmount,
      {
        accounts: {
          bank,
          vault,
          owner: isKp(vaultOwner)
            ? (<Keypair>vaultOwner).publicKey
            : vaultOwner,
          authority: vaultAuth,
          gemBox,
          gemDepositReceipt: GDR,
          gemSource,
          gemMint,
          gemMetadata,
          depositor: isKp(depositor)
            ? (<Keypair>depositor).publicKey
            : depositor,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          metadataProgram: MetadataProgram.PUBKEY,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers,
      }
    );

    return { vaultAuth, gemBox, gemBump, GDR, GDRBump, txSig };
  }

  async withdrawGem(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    gemDestination: PublicKey,
    receiver: PublicKey
  ) {
    const [gemBox, gemBump] = await this.findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await this.findGdrPDA(vault, gemMint);
    const [vaultAuth] = await this.findVaultAuthorityPDA(vault);

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    console.log(
      `withdrawing ${gemAmount} gems from ${gemBox.toBase58()}, GDR ${GDR.toBase58()}`
    );
    const txSig = await this.program.rpc.withdrawGem(gemBump, gemAmount, {
      accounts: {
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
        authority: vaultAuth,
        gemBox,
        gemDepositReceipt: GDR,
        gemDestination,
        gemMint,
        receiver,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers,
    });

    return { vaultAuth, gemBox, gemBump, GDR, GDRBump, txSig };
  }
}
