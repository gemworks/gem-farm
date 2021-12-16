import * as anchor from '@project-serum/anchor';
import { BN, Idl, Program, Wallet } from '@project-serum/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { GemFarm } from '../../target/types/gem_farm';
import { Connection } from '@metaplex/js';
import { isKp } from '../utils/types';
import { GemBankClient } from '../gem-bank/gem-bank.client';
import {
  AccountInfo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export class GemFarmClient extends GemBankClient {
  farmProgram!: anchor.Program<GemFarm>;

  constructor(
    conn: Connection,
    wallet: Wallet,
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

  async fetchRewardAcc(rewardMint: PublicKey, rewardAcc: PublicKey) {
    return this.deserializeTokenAccount(rewardMint, rewardAcc);
  }

  async fetchFundingReceiptAcc(fundingReceipt: PublicKey) {
    return this.farmProgram.account.fundingReceipt.fetch(fundingReceipt);
  }

  // --------------------------------------- find PDA addresses

  async findFarmerPDA(farm: PublicKey, identity: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'farmer',
      farm,
      identity,
    ]);
  }

  async findFarmAuthorityPDA(farm: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [farm]);
  }

  async findAuthorizationProofPDA(farm: PublicKey, funder: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'authorization',
      farm,
      funder,
    ]);
  }

  async findRewardsPotPDA(farm: PublicKey, rewardMint: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'reward_pot',
      farm,
      rewardMint,
    ]);
  }

  async findFundingReceiptPDA(funder: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'funding_receipt',
      funder,
      mint,
    ]);
  }

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  // --------------------------------------- execute ixs

  async initFarm(
    farm: Keypair,
    farmManager: PublicKey | Keypair,
    payer: PublicKey | Keypair,
    bank: Keypair,
    rewardAMint: PublicKey,
    rewardBMint: PublicKey
  ) {
    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(
      farm.publicKey
    );
    const [rewardAPot, rewardAPotBump] = await this.findRewardsPotPDA(
      farm.publicKey,
      rewardAMint
    );
    const [rewardBPot, rewardBPotBump] = await this.findRewardsPotPDA(
      farm.publicKey,
      rewardBMint
    );

    const signers = [farm, bank];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('starting farm at', bank.publicKey.toBase58());
    const txSig = await this.farmProgram.rpc.initFarm(
      farmAuthBump,
      rewardAPotBump,
      rewardBPotBump,
      {
        accounts: {
          farm: farm.publicKey,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          farmAuthority: farmAuth,
          payer: isKp(payer) ? (<Keypair>payer).publicKey : farmManager,
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
      rewardAPot,
      rewardAPotBump,
      rewardBPot,
      rewardBPotBump,
      txSig,
    };
  }

  async initFarmer(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    payer: PublicKey | Keypair
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await this.findVaultPDA(
      farmAcc.bank,
      identityPk
    );
    const [vaultAuth, vaultAuthBump] = await this.findVaultAuthorityPDA(vault); //nice-to-have

    const signers = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);
    if (isKp(payer)) signers.push(<Keypair>payer);

    console.log('adding farmer', identityPk.toBase58());
    const txSig = await this.farmProgram.rpc.initFarmer(farmerBump, vaultBump, {
      accounts: {
        farm,
        farmer,
        identity: identityPk,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
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
    unstake = false
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await this.findVaultPDA(
      farmAcc.bank,
      identityPk
    );
    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(farm);

    const signers = [];
    if (isKp(farmerIdentity)) signers.push(<Keypair>farmerIdentity);

    let txSig;
    if (unstake) {
      console.log('UNstaking gems for', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.unstake(farmerBump, {
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
    } else {
      console.log('staking gems for', identityPk.toBase58());
      txSig = await this.farmProgram.rpc.stake(farmerBump, {
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
      txSig,
    };
  }

  async stake(farm: PublicKey, farmerIdentity: PublicKey | Keypair) {
    return this.stakeCommon(farm, farmerIdentity, false);
  }

  async unstake(farm: PublicKey, farmerIdentity: PublicKey | Keypair) {
    return this.stakeCommon(farm, farmerIdentity, true);
  }

  async authorizeCommon(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    funder: PublicKey,
    deauthorize = false
  ) {
    const [authorizationProof, authorizationProofBump] =
      await this.findAuthorizationProofPDA(farm, funder);

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
      txSig = await this.farmProgram.rpc.authorizeFunder(
        authorizationProofBump,
        {
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
        }
      );
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

  async fundCommon(
    farm: PublicKey,
    rewardMint: PublicKey,
    funder: PublicKey | Keypair,
    amount: BN,
    defund = false,
    rewardSource?: PublicKey,
    duration?: BN
  ) {
    const funderPk = isKp(funder)
      ? (<Keypair>funder).publicKey
      : <PublicKey>funder;

    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(farm);
    const [authorizationProof, authorizationProofBump] =
      await this.findAuthorizationProofPDA(farm, funderPk);
    const [pot, potBump] = await this.findRewardsPotPDA(farm, rewardMint);
    const [fundingReceipt, fundingReceiptBump] =
      await this.findFundingReceiptPDA(funderPk, rewardMint);

    const rewardDestination = await this.findATA(rewardMint, funderPk);

    const signers = [];
    if (isKp(funder)) signers.push(<Keypair>funder);

    let txSig;
    if (defund) {
      console.log('DEfunding reward pot', pot.toBase58());
      txSig = await this.farmProgram.rpc.defund(
        authorizationProofBump,
        fundingReceiptBump,
        potBump,
        amount,
        {
          accounts: {
            farm,
            farmAuthority: farmAuth,
            authorizationProof,
            fundingReceipt,
            rewardPot: pot,
            rewardDestination,
            rewardMint,
            authorizedFunder: funderPk,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers,
        }
      );
    } else {
      console.log('funding reward pot', pot.toBase58());
      txSig = await this.farmProgram.rpc.fund(
        authorizationProofBump,
        fundingReceiptBump,
        potBump,
        amount,
        duration!,
        {
          accounts: {
            farm,
            authorizationProof,
            fundingReceipt,
            rewardPot: pot,
            rewardSource: rewardSource!,
            rewardMint,
            authorizedFunder: funderPk,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          },
          signers,
        }
      );
    }

    return {
      farmAuth,
      farmAuthBump,
      authorizationProof,
      authorizationProofBump,
      pot,
      potBump,
      fundingReceipt,
      fundingReceiptBump,
      txSig,
    };
  }

  async fund(
    farm: PublicKey,
    rewardMint: PublicKey,
    rewardSource: PublicKey,
    funder: PublicKey | Keypair,
    amount: BN,
    duration: BN
  ) {
    return this.fundCommon(
      farm,
      rewardMint,
      funder,
      amount,
      false,
      rewardSource,
      duration
    );
  }

  async defund(
    farm: PublicKey,
    rewardMint: PublicKey,
    funder: PublicKey | Keypair,
    amount: BN
  ) {
    return this.fundCommon(farm, rewardMint, funder, amount, true);
  }

  async lockFunding(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    rewardMint: PublicKey
  ) {
    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    const txSig = await this.farmProgram.rpc.lockFunding({
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

  async claim(
    farm: PublicKey,
    farmerIdentity: PublicKey | Keypair,
    rewardAMint: PublicKey,
    rewardBMint: PublicKey
  ) {
    const identityPk = isKp(farmerIdentity)
      ? (<Keypair>farmerIdentity).publicKey
      : <PublicKey>farmerIdentity;

    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(farm);
    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);

    const [potA, potABump] = await this.findRewardsPotPDA(farm, rewardAMint);
    const [potB, potBBump] = await this.findRewardsPotPDA(farm, rewardBMint);

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
      potA,
      potABump,
      potB,
      potBBump,
      rewardADestination,
      rewardBDestination,
      txSig,
    };
  }
}
