import * as anchor from '@project-serum/anchor';
import { BN, Idl, Program } from '@project-serum/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { GemFarm } from '../types/gem_farm';
import { isKp } from '../gem-common';
import {
  findGdrPDA,
  findGemBoxPDA,
  findRarityPDA,
  findVaultAuthorityPDA,
  findVaultPDA,
  findWhitelistProofPDA,
  GemBankClient,
  WhitelistType,
} from '../gem-bank';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  findAuthorizationProofPDA,
  findFarmAuthorityPDA,
  findFarmerPDA,
  findFarmTreasuryPDA,
  findRewardsPotPDA,
} from './gem-farm.pda';

export const feeAccount = new PublicKey(
  '2xhBxVVuXkdq2MRKerE9mr2s1szfHSedy21MVqf8gPoM'
);

//acts as an enum
export const RewardType = {
  Variable: { variable: {} },
  Fixed: { fixed: {} },
};

export interface FarmConfig {
  minStakingPeriodSec: BN;
  cooldownPeriodSec: BN;
  unstakingFeeLamp: BN;
}

export interface MaxCounts {
  maxFarmers: number;
  maxGems: number;
  maxRarityPoints: number;
}

export interface TierConfig {
  rewardRate: BN;
  requiredTenure: BN;
}

export interface FixedRateSchedule {
  baseRate: BN;
  tier1: TierConfig | null;
  tier2: TierConfig | null;
  tier3: TierConfig | null;
  denominator: BN;
}

export interface FixedRateConfig {
  schedule: FixedRateSchedule;
  amount: BN;
  durationSec: BN;
}

export interface VariableRateConfig {
  amount: BN;
  durationSec: BN;
}

export interface RarityConfig {
  mint: PublicKey;
  rarityPoints: number;
}

export class GemFarmClient extends GemBankClient {
  farmProgram!: anchor.Program<GemFarm>;

  constructor(
    conn: Connection,
    // @ts-ignore
    wallet: anchor.Wallet,
    farmIdl?: Idl,
    farmProgramId?: PublicKey,
    bankIdl?: Idl,
    bankProgramId?: PublicKey
  ) {
    super(conn, wallet, bankIdl, bankProgramId);
    this.setFarmProgram(farmIdl, farmProgramId);
  }

  setFarmProgram(idl?: Idl, programId?: PublicKey) {
    //instantiating program depends on the environment
    if (idl && programId) {
      //means running in prod
      this.farmProgram = new anchor.Program<GemFarm>(
        idl as any,
        programId,
        this.provider
      );
    } else {
      //means running inside test suite
      // @ts-ignore
      this.farmProgram = anchor.workspace.GemFarm as Program<GemFarm>;
    }
  }

  // --------------------------------------- fetch deserialized accounts

  async fetchFarmAcc(farm: PublicKey) {
    return this.farmProgram.account.farm.fetch(farm);
  }

  async fetchFarmerAcc(farmer: PublicKey) {
    return this.farmProgram.account.farmer.fetch(farmer);
  }

  async fetchAuthorizationProofAcc(authorizationProof: PublicKey) {
    return this.farmProgram.account.authorizationProof.fetch(
      authorizationProof
    );
  }

  async fetchTokenAcc(rewardMint: PublicKey, rewardAcc: PublicKey) {
    return this.deserializeTokenAccount(rewardMint, rewardAcc);
  }

  async fetchTreasuryBalance(farm: PublicKey) {
    const [treasury] = await findFarmTreasuryPDA(farm);
    return this.getBalance(treasury);
  }

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  async fetchAllFarmPDAs(manager?: PublicKey) {
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
    const pdas = await this.farmProgram.account.farm.all(filter);
    console.log(`found a total of ${pdas.length} farm PDAs`);
    return pdas;
  }

  async fetchAllFarmerPDAs(farm?: PublicKey, identity?: PublicKey) {
    const filter: any = [];
    if (farm) {
      filter.push({
        memcmp: {
          offset: 8, //need to prepend 8 bytes for anchor's disc
          bytes: farm.toBase58(),
        },
      });
    }
    if (identity) {
      filter.push({
        memcmp: {
          offset: 40, //need to prepend 8 bytes for anchor's disc
          bytes: identity.toBase58(),
        },
      });
    }
    const pdas = await this.farmProgram.account.farmer.all(filter);
    console.log(`found a total of ${pdas.length} farmer PDAs`);
    return pdas;
  }

  async fetchAllAuthProofPDAs(farm?: PublicKey, funder?: PublicKey) {
    const filter: any = [];
    if (farm) {
      filter.push({
        memcmp: {
          offset: 40, //need to prepend 8 bytes for anchor's disc
          bytes: farm.toBase58(),
        },
      });
    }
    if (funder) {
      filter.push({
        memcmp: {
          offset: 8, //need to prepend 8 bytes for anchor's disc
          bytes: funder.toBase58(),
        },
      });
    }
    const pdas = await this.farmProgram.account.authorizationProof.all(filter);
    console.log(`found a total of ${pdas.length} authorized funders`);
    return pdas;
  }

  // --------------------------------------- core ixs

  async initFarm(
    farm: Keypair,
    farmManager: PublicKey | Keypair,
    payer: PublicKey | Keypair,
    bank: Keypair,
    rewardAMint: PublicKey,
    rewardAType: any, //RewardType instance
    rewardBMint: PublicKey,
    rewardBType: any, //RewardType instance
    farmConfig: FarmConfig,
    maxCounts?: MaxCounts
  ) {
    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm.publicKey);
    const [farmTreasury, farmTreasuryBump] = await findFarmTreasuryPDA(
      farm.publicKey
    );
    const [rewardAPot, rewardAPotBump] = await findRewardsPotPDA(
      farm.publicKey,
      rewardAMint
    );
    const [rewardBPot, rewardBPotBump] = await findRewardsPotPDA(
      farm.publicKey,
      rewardBMint
    );

    const signers = [farm, bank];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('starting farm at', bank.publicKey.toBase58());
    const txSig = await this.farmProgram.rpc.initFarm(
      farmAuthBump,
      farmTreasuryBump,
      rewardAType,
      rewardBType,
      farmConfig,
      maxCounts ?? null,
      {
        accounts: {
          farm: farm.publicKey,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          farmTreasury,
          payer: isKp(payer) ? (<Keypair>payer).publicKey : farmManager,
          feeAcc: feeAccount,
          rewardAPot,
          rewardAMint,
          rewardBPot,
          rewardBMint,
          bank: bank.publicKey,
          gemBank: this.bankProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      farmTreasury,
      farmTreasuryBump,
      rewardAPot,
      rewardAPotBump,
      rewardBPot,
      rewardBPotBump,
      txSig,
    };
  }

  async updateFarm(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    config: FarmConfig | null = null,
    newManager: PublicKey | null = null,
    maxCounts?: MaxCounts
  ) {
    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('updating farm');
    const txSig = await this.farmProgram.rpc.updateFarm(
      config,
      newManager,
      maxCounts ?? null,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
        },
        signers,
      }
    );

    return { txSig };
  }

  async payoutFromTreasury(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    destination: PublicKey,
    lamports: BN
  ) {
    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [farmTreasury, farmTreasuryBump] = await findFarmTreasuryPDA(farm);

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('paying out from treasury', farmTreasury.toBase58());
    const txSig = await this.farmProgram.rpc.payoutFromTreasury(
      farmAuthBump,
      farmTreasuryBump,
      lamports,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          farmTreasury,
          destination,
          systemProgram: SystemProgram.programId,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      farmTreasury,
      farmTreasuryBump,
      txSig,
    };
  }

  async addToBankWhitelist(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    addressToWhitelist: PublicKey,
    whitelistType: WhitelistType
  ) {
    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [whitelistProof, whitelistProofBump] = await findWhitelistProofPDA(
      farmAcc.bank,
      addressToWhitelist
    );

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log(`adding ${addressToWhitelist.toBase58()} to whitelist`);
    const txSig = await this.farmProgram.rpc.addToBankWhitelist(
      farmAuthBump,
      whitelistType,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          bank: farmAcc.bank,
          addressToWhitelist,
          whitelistProof,
          systemProgram: SystemProgram.programId,
          gemBank: this.bankProgram.programId,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      whitelistProof,
      whitelistProofBump,
      txSig,
    };
  }

  async removeFromBankWhitelist(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    addressToRemove: PublicKey
  ) {
    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [whitelistProof, whitelistProofBump] = await findWhitelistProofPDA(
      farmAcc.bank,
      addressToRemove
    );

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log(`removing ${addressToRemove.toBase58()} from whitelist`);
    const txSig = await this.farmProgram.rpc.removeFromBankWhitelist(
      farmAuthBump,
      whitelistProofBump,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          bank: farmAcc.bank,
          addressToRemove,
          whitelistProof,
          gemBank: this.bankProgram.programId,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      whitelistProof,
      whitelistProofBump,
      txSig,
    };
  }

  // --------------------------------------- farmer ops ixs

  async initFarmer(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    payer: PublicKey | Keypair
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await findVaultPDA(farmAcc.bank, identityPk);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault); //nice-to-have

    const signers = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);
    if (isKp(payer)) signers.push(<Keypair>payer);

    console.log('adding farmer', identityPk.toBase58());
    const txSig = await this.farmProgram.rpc.initFarmer({
      accounts: {
        farm,
        farmer,
        identity: identityPk,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
        feeAcc: feeAccount,
        bank: farmAcc.bank,
        vault,
        gemBank: this.bankProgram.programId,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return {
      farmer,
      farmerBump,
      vault,
      vaultBump,
      vaultAuth,
      vaultAuthBump,
      txSig,
    };
  }

  async stakeCommon(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    unstake = false,
    skipRewards = false
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await findVaultPDA(farmAcc.bank, identityPk);
    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [farmTreasury, farmTreasuryBump] = await findFarmTreasuryPDA(farm);

    const signers = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);

    let txSig;
    if (unstake) {
      console.log('UNstaking gems for', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.unstake(
        farmAuthBump,
        farmTreasuryBump,
        farmerBump,
        skipRewards,
        {
          accounts: {
            farm,
            farmer,
            farmTreasury,
            identity: identityPk,
            bank: farmAcc.bank,
            vault,
            farmAuthority: farmAuth,
            gemBank: this.bankProgram.programId,
            systemProgram: SystemProgram.programId,
          },
          signers,
        }
      );
    } else {
      console.log('staking gems for', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.stake(farmAuthBump, farmerBump, {
        accounts: {
          farm,
          farmer,
          identity: identityPk,
          bank: farmAcc.bank,
          vault,
          farmAuthority: farmAuth,
          gemBank: this.bankProgram.programId,
        },
        signers,
      });
    }

    return {
      farmer,
      farmerBump,
      vault,
      vaultBump,
      farmAuth,
      farmAuthBump,
      farmTreasury,
      farmTreasuryBump,
      txSig,
    };
  }

  async stake(farm: PublicKey, farmerIdentity: PublicKey | Keypair) {
    return this.stakeCommon(farm, farmerIdentity, false);
  }

  async unstake(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    skipRewards = false
  ) {
    return this.stakeCommon(farm, farmerIdentity, true, skipRewards);
  }

  async claim(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    rewardAMint: PublicKey,
    rewardBMint: PublicKey
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [farmer, farmerBump] = await findFarmerPDA(farm, identityPk);

    const [potA, potABump] = await findRewardsPotPDA(farm, rewardAMint);
    const [potB, potBBump] = await findRewardsPotPDA(farm, rewardBMint);

    const rewardADestination = await this.findATA(rewardAMint, identityPk);
    const rewardBDestination = await this.findATA(rewardBMint, identityPk);

    const signers = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);

    const txSig = await this.farmProgram.rpc.claim(
      farmAuthBump,
      farmerBump,
      potABump,
      potBBump,
      {
        accounts: {
          farm,
          farmAuthority: farmAuth,
          farmer,
          identity: identityPk,
          rewardAPot: potA,
          rewardAMint,
          rewardADestination,
          rewardBPot: potB,
          rewardBMint,
          rewardBDestination,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      farmer,
      farmerBump,
      potA,
      potABump,
      potB,
      potBBump,
      rewardADestination,
      rewardBDestination,
      txSig,
    };
  }

  async flashDeposit(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    gemAmount: BN,
    gemMint: PublicKey,
    gemSource: PublicKey,
    mintProof?: PublicKey,
    metadata?: PublicKey,
    creatorProof?: PublicKey
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await findVaultPDA(farmAcc.bank, identityPk);
    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);

    const [gemBox, gemBoxBump] = await findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await findGdrPDA(vault, gemMint);
    const [vaultAuth, vaultAuthBump] = await findVaultAuthorityPDA(vault);
    const [gemRarity, gemRarityBump] = await findRarityPDA(
      farmAcc.bank,
      gemMint
    );

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

    const signers: Keypair[] = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);

    console.log('flash depositing on behalf of', identityPk.toBase58());
    const flashDepositIx = await this.farmProgram.instruction.flashDeposit(
      farmerBump,
      vaultAuthBump,
      gemRarityBump,
      gemAmount,
      {
        accounts: {
          farm,
          farmAuthority: farmAuth,
          farmer,
          identity: identityPk,
          bank: farmAcc.bank,
          vault,
          vaultAuthority: vaultAuth,
          gemBox,
          gemDepositReceipt: GDR,
          gemSource,
          gemMint,
          gemRarity,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          gemBank: this.bankProgram.programId,
        },
        remainingAccounts,
      }
    );

    //will have no effect on solana networks < 1.9.2
    const extraComputeIx = this.createExtraComputeIx(256000);

    //craft transaction
    let tx = new Transaction({
      feePayer: this.wallet.publicKey,
      recentBlockhash: (await this.conn.getRecentBlockhash()).blockhash,
    });
    tx.add(extraComputeIx);
    tx.add(flashDepositIx);
    tx = await this.wallet.signTransaction(tx);
    if (signers.length > 0) {
      tx.partialSign(...signers);
    }
    const txSig = await this.conn.sendRawTransaction(tx.serialize());

    return {
      farmer,
      farmerBump,
      vault,
      vaultBump,
      farmAuth,
      farmAuthBump,
      gemBox,
      gemBoxBump,
      GDR,
      GDRBump,
      vaultAuth,
      vaultAuthBump,
      txSig,
    };
  }

  async refreshFarmer(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    reenroll?: boolean
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const [farmer, farmerBump] = await findFarmerPDA(farm, identityPk);

    let txSig;
    if (reenroll !== null && reenroll !== undefined) {
      const signers = [];
      if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);

      console.log('refreshing farmer (SIGNED)', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.refreshFarmerSigned(
        farmerBump,
        reenroll,
        {
          accounts: {
            farm,
            farmer,
            identity: identityPk,
          },
          signers,
        }
      );
    } else {
      console.log('refreshing farmer', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.refreshFarmer(farmerBump, {
        accounts: {
          farm,
          farmer,
          identity: identityPk,
        },
        signers: [],
      });
    }

    return {
      farmer,
      farmerBump,
      txSig,
    };
  }

  // --------------------------------------- funder ops ixs

  async authorizeCommon(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    funder: PublicKey,
    deauthorize = false
  ) {
    const [authorizationProof, authorizationProofBump] =
      await findAuthorizationProofPDA(farm, funder);

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    let txSig;
    if (deauthorize) {
      console.log('DEauthorizing funder', funder.toBase58());
      txSig = await this.farmProgram.rpc.deauthorizeFunder(
        authorizationProofBump,
        {
          accounts: {
            farm,
            farmManager: isKp(farmManager)
              ? (<Keypair>farmManager).publicKey
              : farmManager,
            funderToDeauthorize: funder,
            authorizationProof,
            systemProgram: SystemProgram.programId,
          },
          signers,
        }
      );
    } else {
      console.log('authorizing funder', funder.toBase58());
      txSig = await this.farmProgram.rpc.authorizeFunder({
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          funderToAuthorize: funder,
          authorizationProof,
          systemProgram: SystemProgram.programId,
        },
        signers,
      });
    }

    return { authorizationProof, authorizationProofBump, txSig };
  }

  async authorizeFunder(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    funderToAuthorize: PublicKey
  ) {
    return this.authorizeCommon(farm, farmManager, funderToAuthorize, false);
  }

  async deauthorizeFunder(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    funderToDeauthorize: PublicKey
  ) {
    return this.authorizeCommon(farm, farmManager, funderToDeauthorize, true);
  }

  // --------------------------------------- reward ops ixs

  async fundReward(
    farm: PublicKey,
    rewardMint: PublicKey,
    funder: PublicKey | Keypair,
    rewardSource: PublicKey,
    variableRateConfig: VariableRateConfig | null = null,
    fixedRateConfig: FixedRateConfig | null = null
  ) {
    const funderPk = isKp(funder)
      ? (<Keypair>funder).publicKey
      : <PublicKey>funder;

    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [authorizationProof, authorizationProofBump] =
      await findAuthorizationProofPDA(farm, funderPk);
    const [pot, potBump] = await findRewardsPotPDA(farm, rewardMint);

    const signers = [];
    if (isKp(funder)) signers.push(<Keypair>funder);

    console.log('funding reward pot', pot.toBase58());
    const txSig = await this.farmProgram.rpc.fundReward(
      authorizationProofBump,
      potBump,
      variableRateConfig as any,
      fixedRateConfig as any,
      {
        accounts: {
          farm,
          authorizationProof,
          authorizedFunder: funderPk,
          rewardPot: pot,
          rewardSource,
          rewardMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        signers,
      }
    );

    return {
      farmAuth,
      farmAuthBump,
      authorizationProof,
      authorizationProofBump,
      pot,
      potBump,
      txSig,
    };
  }

  async cancelReward(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    rewardMint: PublicKey,
    receiver: PublicKey
  ) {
    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);
    const [pot, potBump] = await findRewardsPotPDA(farm, rewardMint);
    const rewardDestination = await this.findATA(rewardMint, receiver);

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    const txSig = await this.farmProgram.rpc.cancelReward(
      farmAuthBump,
      potBump,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          rewardPot: pot,
          rewardDestination,
          rewardMint,
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
      farmAuth,
      farmAuthBump,
      pot,
      potBump,
      rewardDestination,
      txSig,
    };
  }

  async lockReward(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    rewardMint: PublicKey
  ) {
    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    const txSig = await this.farmProgram.rpc.lockReward({
      accounts: {
        farm,
        farmManager: isKp(farmManager)
          ? (<Keypair>farmManager).publicKey
          : farmManager,
        rewardMint,
      },
      signers,
    });

    return { txSig };
  }

  // --------------------------------------- rarity

  async addRaritiesToBank(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    rarityConfigs: RarityConfig[]
  ) {
    const farmAcc = await this.fetchFarmAcc(farm);
    const bank = farmAcc.bank;

    const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farm);

    //prepare rarity configs
    const completeRarityConfigs = [...rarityConfigs];
    const remainingAccounts = [];

    for (const config of completeRarityConfigs) {
      const [gemRarity] = await findRarityPDA(bank, config.mint);
      //add mint
      remainingAccounts.push({
        pubkey: config.mint,
        isWritable: false,
        isSigner: false,
      });
      //add rarity pda
      remainingAccounts.push({
        pubkey: gemRarity,
        isWritable: true,
        isSigner: false,
      });
    }

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log("adding rarities to farm's bank");
    const txSig = await this.farmProgram.rpc.addRaritiesToBank(
      farmAuthBump,
      completeRarityConfigs,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          bank,
          gemBank: this.bankProgram.programId,
          systemProgram: SystemProgram.programId,
        },
        remainingAccounts,
        signers,
      }
    );

    return {
      bank,
      farmAuth,
      farmAuthBump,
      completeRarityConfigs,
      txSig,
    };
  }

  // --------------------------------------- helpers

  //returns "variable" or "fixed"
  parseRewardType(reward: any): string {
    return Object.keys(reward.rewardType)[0];
  }

  //returns "staked" / "unstaked" / "pendingCooldown"
  parseFarmerState(farmer: any): string {
    return Object.keys(farmer.state)[0];
  }

  createExtraComputeIx(newComputeBudget: number): TransactionInstruction {
    const data = Buffer.from(
      Uint8Array.of(
        0,
        ...new BN(newComputeBudget).toArray('le', 4),
        ...new BN(0).toArray('le', 4)
      )
    );

    return new TransactionInstruction({
      keys: [],
      programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
      data,
    });
  }
}
