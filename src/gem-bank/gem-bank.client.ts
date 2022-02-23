import * as anchor from '@project-serum/anchor';
import { BN, Idl, Program, Provider } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  AccountInfo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AccountUtils } from '../gem-common';
import { GemBank } from '../types/gem_bank';
import { isKp } from '../gem-common';
import {
  findGdrPDA,
  findGemBoxPDA,
  findRarityPDA,
  findVaultAuthorityPDA,
  findVaultPDA,
  findWhitelistProofPDA,
} from './gem-bank.pda';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export enum WhitelistType {
  Creator = 1 << 0,
  Mint = 1 << 1,
}

export class GemBankClient extends AccountUtils {
  // @ts-ignore
  wallet: anchor.Wallet;
  provider!: anchor.Provider;
  bankProgram!: anchor.Program<GemBank>;

  constructor(
    conn: Connection,
    // @ts-ignore
    wallet: anchor.Wallet,
    idl?: Idl,
    programId?: PublicKey
  ) {
    super(conn);
    this.wallet = wallet;
    this.setProvider();
    this.setBankProgram(idl, programId);
  }

  setProvider() {
    this.provider = new Provider(
      this.conn,
      this.wallet,
      Provider.defaultOptions()
    );
    anchor.setProvider(this.provider);
  }

  setBankProgram(idl?: Idl, programId?: PublicKey) {
    //instantiating program depends on the environment
    if (idl && programId) {
      //means running in prod
      this.bankProgram = new anchor.Program<GemBank>(
        idl as any,
        programId,
        this.provider
      );
    } else {
      //means running inside test suite
      // @ts-ignore
      this.bankProgram = anchor.workspace.GemBank as Program<GemBank>;
    }
  }

  // --------------------------------------- fetch deserialized accounts

  async fetchBankAcc(bank: PublicKey) {
    return this.bankProgram.account.bank.fetch(bank);
  }

  async fetchVaultAcc(vault: PublicKey) {
    return this.bankProgram.account.vault.fetch(vault);
  }

  async fetchGDRAcc(GDR: PublicKey) {
    return this.bankProgram.account.gemDepositReceipt.fetch(GDR);
  }

  async fetchGemAcc(mint: PublicKey, gemAcc: PublicKey): Promise<AccountInfo> {
    return this.deserializeTokenAccount(mint, gemAcc);
  }

  async fetchWhitelistProofAcc(proof: PublicKey) {
    return this.bankProgram.account.whitelistProof.fetch(proof);
  }

  async fetchRarity(rarity: PublicKey) {
    return this.bankProgram.account.rarity.fetch(rarity);
  }

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  async fetchAllBankPDAs(manager?: PublicKey) {
    const filter = manager
      ? [
          {
            memcmp: {
              offset: 10, //need to prepend 8 bytes for anchor's disc
              bytes: manager.toBase58(),
            },
          },
        ]
      : [];
    const pdas = await this.bankProgram.account.bank.all(filter);
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
    const pdas = await this.bankProgram.account.vault.all(filter);
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
    const pdas = await this.bankProgram.account.gemDepositReceipt.all(filter);
    console.log(`found a total of ${pdas.length} GDR PDAs`);
    return pdas;
  }

  async fetchAllWhitelistProofPDAs(bank?: PublicKey) {
    const filter = bank
      ? [
          {
            memcmp: {
              offset: 41, //need to prepend 8 bytes for anchor's disc
              bytes: bank.toBase58(),
            },
          },
        ]
      : [];
    const pdas = await this.bankProgram.account.whitelistProof.all(filter);
    console.log(`found a total of ${pdas.length} whitelist proofs`);
    return pdas;
  }

  async fetchAllRarityPDAs() {
    //todo need to add client-side (not stored in PDA) filtering based on finding PDAs for given farm and mint
    const pdas = await this.bankProgram.account.rarity.all();
    console.log(`found a total of ${pdas.length} rarity PDAs`);
    return pdas;
  }

  // --------------------------------------- execute ixs

  async initBank(
    bank: Keypair,
    bankManager: PublicKey | Keypair,
    payer: PublicKey | Keypair
  ) {
    const signers = [bank];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    console.log('starting bank at', bank.publicKey.toBase58());
    const txSig = await this.bankProgram.rpc.initBank({
      accounts: {
        bank: bank.publicKey,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { txSig };
  }

  async updateBankManager(
    bank: PublicKey,
    bankManager: PublicKey | Keypair,
    newManager: PublicKey
  ) {
    const signers = [];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    console.log('updating bank manager to', newManager.toBase58());
    const txSig = await this.bankProgram.rpc.updateBankManager(newManager, {
      accounts: {
        bank,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
      },
      signers,
    });

    return { txSig };
  }

  async initVault(
    bank: PublicKey,
    creator: PublicKey | Keypair,
    payer: PublicKey | Keypair,
    owner: PublicKey,
    name: string
  ) {
    const creatorPk = isKp(creator)
      ? (<Keypair>creator).publicKey
      : <PublicKey>creator;

    const [vault, vaultBump] = await findVaultPDA(bank, creatorPk);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault); //nice-to-have

    const signers = [];
    if (isKp(creator)) signers.push(<Keypair>creator);
    if (isKp(payer)) signers.push(<Keypair>payer);

    console.log('creating vault at', vault.toBase58());
    const txSig = await this.bankProgram.rpc.initVault(owner, name, {
      accounts: {
        bank,
        vault,
        creator: creatorPk,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : <PublicKey>payer,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { vault, vaultBump, vaultAuth, vaultAuthBump, txSig };
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
    const txSig = await this.bankProgram.rpc.updateVaultOwner(newOwner, {
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
    bankManager: PublicKey | Keypair,
    vaultLocked: boolean
  ) {
    const signers = [];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    console.log('setting vault lock to', vaultLocked);
    const txSig = await this.bankProgram.rpc.setVaultLock(vaultLocked, {
      accounts: {
        bank,
        vault,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
      },
      signers,
    });

    return { txSig };
  }

  async setBankFlags(
    bank: PublicKey,
    bankManager: PublicKey | Keypair,
    flags: BankFlags
  ) {
    const signers = [];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    console.log('setting bank flags to', flags);
    const txSig = await this.bankProgram.rpc.setBankFlags(flags, {
      accounts: {
        bank,
        bankManager: bankManager
          ? (<Keypair>bankManager).publicKey
          : bankManager,
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
    mintProof?: PublicKey,
    metadata?: PublicKey,
    creatorProof?: PublicKey
  ) {
    const [gemBox, gemBoxBump] = await findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await findGdrPDA(vault, gemMint);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);
    const [gemRarity, gemRarityBump] = await findRarityPDA(bank, gemMint);

    const remainingAccounts = [];
    if (mintProof)
      remainingAccounts.push({
        pubkey: mintProof,
        isWritable: false,
        isSigner: false,
      });
    if (metadata)
      remainingAccounts.push({
        pubkey: metadata,
        isWritable: false,
        isSigner: false,
      });
    if (creatorProof)
      remainingAccounts.push({
        pubkey: creatorProof,
        isWritable: false,
        isSigner: false,
      });

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    console.log(
      `depositing ${gemAmount} gems into ${gemBox.toBase58()}, GDR ${GDR.toBase58()}`
    );
    const txSig = await this.bankProgram.rpc.depositGem(
      vaultAuthBump,
      gemRarityBump,
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
          gemRarity,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        remainingAccounts,
        signers,
      }
    );

    return {
      vaultAuth,
      vaultAuthBump,
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      txSig,
    };
  }

  async withdrawGem(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    receiver: PublicKey
  ) {
    const [gemBox, gemBoxBump] = await findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await findGdrPDA(vault, gemMint);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);
    const [gemRarity, gemRarityBump] = await findRarityPDA(bank, gemMint);

    const gemDestination = await this.findATA(gemMint, receiver);

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    console.log(
      `withdrawing ${gemAmount} gems from ${gemBox.toBase58()}, GDR ${GDR.toBase58()}`
    );
    const txSig = await this.bankProgram.rpc.withdrawGem(
      vaultAuthBump,
      gemBoxBump,
      GDRBump,
      gemRarityBump,
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
          gemDestination,
          gemMint,
          gemRarity,
          receiver,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers,
      }
    );

    return {
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      vaultAuth,
      vaultAuthBump,
      gemDestination,
      txSig,
    };
  }

  async addToWhitelist(
    bank: PublicKey,
    bankManager: PublicKey | Keypair,
    addressToWhitelist: PublicKey,
    whitelistType: WhitelistType,
    payer?: PublicKey
  ) {
    const managerPk = isKp(bankManager)
      ? (<Keypair>bankManager).publicKey
      : <PublicKey>bankManager;

    const [whitelistProof, whitelistBump] = await findWhitelistProofPDA(
      bank,
      addressToWhitelist
    );

    const signers = [];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    const txSig = await this.bankProgram.rpc.addToWhitelist(whitelistType, {
      accounts: {
        bank,
        bankManager: managerPk,
        addressToWhitelist,
        whitelistProof,
        systemProgram: SystemProgram.programId,
        payer: payer ?? managerPk,
      },
      signers,
    });

    return { whitelistProof, whitelistBump, txSig };
  }

  async removeFromWhitelist(
    bank: PublicKey,
    bankManager: PublicKey | Keypair,
    addressToRemove: PublicKey,
    fundsReceiver?: PublicKey
  ) {
    const [whitelistProof, whitelistBump] = await findWhitelistProofPDA(
      bank,
      addressToRemove
    );

    const signers = [];
    if (isKp(bankManager)) signers.push(<Keypair>bankManager);

    const bankManagerPk = isKp(bankManager)
      ? (<Keypair>bankManager).publicKey
      : <PublicKey>bankManager;

    const txSig = await this.bankProgram.rpc.removeFromWhitelist(
      whitelistBump,
      {
        accounts: {
          bank,
          bankManager: bankManagerPk,
          addressToRemove,
          whitelistProof,
          fundsReceiver: fundsReceiver ?? bankManagerPk,
        },
        signers,
      }
    );

    return { whitelistProof, whitelistBump, txSig };
  }
}
