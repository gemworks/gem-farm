import * as anchor from '@project-serum/anchor';
import { AnchorProvider, BN, Idl, Program } from '@project-serum/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AccountUtils, isKp } from '../gem-common';
import { GemBank } from '../types/gem_bank';
import {
  findGdrPDA,
  findGemBoxPDA,
  findRarityPDA,
  findVaultAuthorityPDA,
  findVaultPDA,
  findWhitelistProofPDA,
} from './gem-bank.pda';
import {
  AuthorizationData,
  Metadata,
  PROGRAM_ID as TMETA_PROG_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { Metaplex } from '@metaplex-foundation/js';
import { PROGRAM_ID as AUTH_PROG_ID } from '@metaplex-foundation/mpl-token-auth-rules';
import {
  buildAndSendTx,
  fetchNft,
  findTokenRecordPDA,
  getTotalComputeIxs,
} from '../gem-common/pnft';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export enum WhitelistType {
  Creator = 1 << 0,
  Mint = 1 << 1,
}

export class GemBankClient extends AccountUtils {
  wallet: anchor.Wallet;
  provider!: anchor.Provider;
  bankProgram!: anchor.Program<GemBank>;

  constructor(
    conn: Connection,
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
    this.provider = new AnchorProvider(
      this.conn,
      this.wallet,
      AnchorProvider.defaultOptions()
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

  async fetchGemAcc(mint: PublicKey, gemAcc: PublicKey) {
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
    const txSig = await this.bankProgram.methods
      .initBank()
      .accounts({
        bank: bank.publicKey,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

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
    const txSig = await this.bankProgram.methods
      .updateBankManager(newManager)
      .accounts({
        bank,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
      })
      .signers(signers)
      .rpc();

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
    const txSig = await this.bankProgram.methods
      .initVault(owner, name)
      .accounts({
        bank,
        vault,
        creator: creatorPk,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : <PublicKey>payer,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

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
    const txSig = await this.bankProgram.methods
      .updateVaultOwner(newOwner)
      .accounts({
        bank,
        vault,
        owner: isKp(existingOwner)
          ? (<Keypair>existingOwner).publicKey
          : existingOwner,
      })
      .signers(signers)
      .rpc();

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
    const txSig = await this.bankProgram.methods
      .setVaultLock(vaultLocked)
      .accounts({
        bank,
        vault,
        bankManager: isKp(bankManager)
          ? (<Keypair>bankManager).publicKey
          : bankManager,
      })
      .signers(signers)
      .rpc();

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
    const txSig = await this.bankProgram.methods
      .setBankFlags(flags)
      .accounts({
        bank,
        bankManager: bankManager
          ? (<Keypair>bankManager).publicKey
          : bankManager,
      })
      .signers(signers)
      .rpc();

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
    creatorProof?: PublicKey,
    pnft = false
  ) {
    if (pnft) {
      const {
        vaultAuth,
        vaultAuthBump,
        gemBox,
        gemBoxBump,
        GDR,
        GDRBump,
        gemRarity,
        gemRarityBump,
        ixs,
      } = await this.buildDepositGemPnft(
        bank,
        vault,
        vaultOwner,
        gemAmount,
        gemMint,
        gemSource,
        mintProof,
        creatorProof
      );

      const txSig = await buildAndSendTx({
        provider: this.provider as AnchorProvider,
        ixs,
      });

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

    const {
      vaultAuth,
      vaultAuthBump,
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      builder,
    } = await this.buildDepositGem(
      bank,
      vault,
      vaultOwner,
      gemAmount,
      gemMint,
      gemSource,
      mintProof,
      metadata,
      creatorProof
    );

    const txSig = await builder.rpc();

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

  async buildDepositGem(
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
    const builder = this.bankProgram.methods
      .depositGem(vaultAuthBump, gemRarityBump, gemAmount)
      .accounts({
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
        authority: vaultAuth,
        gemBox,
        gemDepositReceipt: GDR,
        gemSource,
        gemMint,
        gemRarity,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .signers(signers);

    return {
      vaultAuth,
      vaultAuthBump,
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      builder,
    };
  }

  async buildDepositGemPnft(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    gemSource: PublicKey,
    mintProof?: PublicKey,
    creatorProof?: PublicKey,
    compute = 400000,
    priorityFee = 1
  ) {
    const [gemBox, gemBoxBump] = await findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await findGdrPDA(vault, gemMint);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);
    const [gemRarity, gemRarityBump] = await findRarityPDA(bank, gemMint);

    //pnft
    const {
      meta,
      ownerTokenRecordBump,
      ownerTokenRecordPda,
      destTokenRecordBump,
      destTokenRecordPda,
      ruleSet,
      nftEditionPda,
      authDataSerialized,
    } = await this.prepPnftAccounts({
      nftMint: gemMint,
      destAta: gemBox,
      authData: null, //currently useless
      sourceAta: gemSource,
    });
    const remainingAccounts = [];
    if (!!ruleSet) {
      remainingAccounts.push({
        pubkey: ruleSet,
        isSigner: false,
        isWritable: false,
      });
    }
    if (mintProof)
      remainingAccounts.push({
        pubkey: mintProof,
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
      `depositing ${gemAmount} gems into ${gemBox.toBase58()}, GDR ${GDR.toBase58()} (PNFT)`
    );
    const builder = this.bankProgram.methods
      .depositGemPnft(
        vaultAuthBump,
        gemRarityBump,
        gemAmount,
        authDataSerialized,
        !!ruleSet
      )
      .accounts({
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
        authority: vaultAuth,
        gemBox,
        gemDepositReceipt: GDR,
        gemSource,
        gemMint,
        gemRarity,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        gemMetadata: meta,
        gemEdition: nftEditionPda,
        ownerTokenRecord: ownerTokenRecordPda,
        destTokenRecord: destTokenRecordPda,
        pnftShared: {
          authorizationRulesProgram: AUTH_PROG_ID,
          tokenMetadataProgram: TMETA_PROG_ID,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
      })
      .remainingAccounts(remainingAccounts)
      .signers(signers);

    const [modifyComputeUnits, addPriorityFee] = getTotalComputeIxs(
      compute,
      priorityFee
    );

    const ixs = [
      modifyComputeUnits,
      addPriorityFee,
      await builder.instruction(),
    ];

    return {
      vaultAuth,
      vaultAuthBump,
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      builder,
      ixs,
      ownerTokenRecordBump,
      ownerTokenRecordPda,
      destTokenRecordBump,
      destTokenRecordPda,
      meta,
    };
  }

  async withdrawGem(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    receiver: PublicKey,
    pnft = false
  ) {
    if (pnft) {
      const {
        gemBox,
        gemBoxBump,
        GDR,
        GDRBump,
        gemRarity,
        gemRarityBump,
        vaultAuth,
        vaultAuthBump,
        gemDestination,
        ixs,
      } = await this.buildWithdrawGemPnft(
        bank,
        vault,
        vaultOwner,
        gemAmount,
        gemMint,
        receiver
      );

      const txSig = await buildAndSendTx({
        provider: this.provider as AnchorProvider,
        ixs,
      });

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

    const {
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      gemRarity,
      gemRarityBump,
      vaultAuth,
      vaultAuthBump,
      gemDestination,
      builder,
    } = await this.buildWithdrawGem(
      bank,
      vault,
      vaultOwner,
      gemAmount,
      gemMint,
      receiver
    );

    const txSig = await builder.rpc();

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

  async buildWithdrawGem(
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
    const builder = this.bankProgram.methods
      .withdrawGem(vaultAuthBump, gemBoxBump, GDRBump, gemRarityBump, gemAmount)
      .accounts({
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
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
      })
      .signers(signers);

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
      builder,
    };
  }

  async buildWithdrawGemPnft(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    receiver: PublicKey,
    compute = 400000,
    priorityFee = 1
  ) {
    const [gemBox, gemBoxBump] = await findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await findGdrPDA(vault, gemMint);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);
    const [gemRarity, gemRarityBump] = await findRarityPDA(bank, gemMint);

    const gemDestination = await this.findATA(gemMint, receiver);

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    //pnft
    const {
      meta,
      ownerTokenRecordBump,
      ownerTokenRecordPda,
      destTokenRecordBump,
      destTokenRecordPda,
      ruleSet,
      nftEditionPda,
      authDataSerialized,
    } = await this.prepPnftAccounts({
      nftMint: gemMint,
      destAta: gemDestination,
      authData: null, //currently useless
      sourceAta: gemBox,
    });
    const remainingAccounts = [];
    if (!!ruleSet) {
      remainingAccounts.push({
        pubkey: ruleSet,
        isSigner: false,
        isWritable: false,
      });
    }

    console.log(
      `withdrawing ${gemAmount} gems from ${gemBox.toBase58()}, GDR ${GDR.toBase58()} (PNFT)`
    );
    const builder = this.bankProgram.methods
      .withdrawGemPnft(
        vaultAuthBump,
        gemBoxBump,
        GDRBump,
        gemRarityBump,
        gemAmount,
        authDataSerialized,
        !!ruleSet
      )
      .accounts({
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
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
        gemMetadata: meta,
        gemEdition: nftEditionPda,
        destTokenRecord: destTokenRecordPda,
        ownerTokenRecord: ownerTokenRecordPda,
        pnftShared: {
          authorizationRulesProgram: AUTH_PROG_ID,
          tokenMetadataProgram: TMETA_PROG_ID,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        },
      })
      .signers(signers)
      .remainingAccounts(remainingAccounts);

    const [modifyComputeUnits, addPriorityFee] = getTotalComputeIxs(
      compute,
      priorityFee
    );

    const ixs = [
      modifyComputeUnits,
      addPriorityFee,
      await builder.instruction(),
    ];

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
      builder,
      ixs,
      ownerTokenRecordBump,
      ownerTokenRecordPda,
      destTokenRecordBump,
      destTokenRecordPda,
      meta,
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

    const txSig = await this.bankProgram.methods
      .addToWhitelist(whitelistType)
      .accounts({
        bank,
        bankManager: managerPk,
        addressToWhitelist,
        whitelistProof,
        systemProgram: SystemProgram.programId,
        payer: payer ?? managerPk,
      })
      .signers(signers)
      .rpc();

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

    const txSig = await this.bankProgram.methods
      .removeFromWhitelist(whitelistBump)
      .accounts({
        bank,
        bankManager: bankManagerPk,
        addressToRemove,
        whitelistProof,
        fundsReceiver: fundsReceiver ?? bankManagerPk,
      })
      .signers(signers)
      .rpc();

    return { whitelistProof, whitelistBump, txSig };
  }

  async withdrawTokensAuth(
    bank: PublicKey,
    vault: PublicKey,
    vaultOwner: PublicKey | Keypair,
    tokenMint: PublicKey
  ) {
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);

    const recipientAta = await this.findATA(
      tokenMint,
      isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : <PublicKey>vaultOwner
    );
    const vaultAta = await this.findATA(tokenMint, vaultAuth);

    const signers = [];
    if (isKp(vaultOwner)) signers.push(<Keypair>vaultOwner);

    const builder = this.bankProgram.methods
      .withdrawTokensAuth()
      .accounts({
        bank,
        vault,
        owner: isKp(vaultOwner) ? (<Keypair>vaultOwner).publicKey : vaultOwner,
        authority: vaultAuth,
        recipientAta,
        vaultAta,
        mint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers(signers);

    return {
      recipientAta,
      vaultAta,
      vaultAuth,
      vaultAuthBump,
      gemDestination: recipientAta,
      builder,
    };
  }

  async prepPnftAccounts({
    nftMetadata,
    nftMint,
    sourceAta,
    destAta,
    authData = null,
  }: {
    nftMetadata?: PublicKey;
    nftMint: PublicKey;
    sourceAta: PublicKey;
    destAta: PublicKey;
    authData?: AuthorizationData | null;
  }) {
    let meta;
    let creators: PublicKey[] = [];
    if (nftMetadata) {
      meta = nftMetadata;
    } else {
      const nft = await fetchNft(this.provider.connection, nftMint);
      meta = nft.metadataAddress;
      creators = nft.creators.map((c) => c.address);
    }

    const inflatedMeta = await Metadata.fromAccountAddress(
      this.provider.connection,
      meta
    );
    const ruleSet = inflatedMeta.programmableConfig?.ruleSet;

    const [ownerTokenRecordPda, ownerTokenRecordBump] =
      await findTokenRecordPDA(nftMint, sourceAta);
    const [destTokenRecordPda, destTokenRecordBump] = await findTokenRecordPDA(
      nftMint,
      destAta
    );

    //retrieve edition PDA
    const mplex = new Metaplex(this.provider.connection);
    const nftEditionPda = mplex.nfts().pdas().edition({ mint: nftMint });

    //have to re-serialize due to anchor limitations
    const authDataSerialized = authData
      ? {
          payload: Object.entries(authData.payload.map).map(([k, v]) => {
            return { name: k, payload: v };
          }),
        }
      : null;

    return {
      meta,
      creators,
      ownerTokenRecordBump,
      ownerTokenRecordPda,
      destTokenRecordBump,
      destTokenRecordPda,
      ruleSet,
      nftEditionPda,
      authDataSerialized,
    };
  }
}
