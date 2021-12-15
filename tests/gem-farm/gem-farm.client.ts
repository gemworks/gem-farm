import * as anchor from '@project-serum/anchor';
import { BN, Idl, Program, Wallet } from '@project-serum/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { GemFarm } from '../../target/types/gem_farm';
import { Connection } from '@metaplex/js';
import { isKp } from '../utils/types';
import { GemBankClient } from '../gem-bank/gem-bank.client';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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

  async fetchRDRAcc(rdr: PublicKey) {
    return this.farmProgram.account.rewardsDepositReceipt.fetch(rdr);
  }

  async fetchRewardsPotAcc(rewardsMint: PublicKey, rewardsPot: PublicKey) {
    return this.deserializeTokenAccount(rewardsMint, rewardsPot);
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

  async findRdrPDA(funder: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'rewards_deposit_receipt',
      funder,
      mint,
    ]);
  }

  async findRewardsPotPDA(farm: PublicKey, rewardsMint: PublicKey) {
    return this.findProgramAddress(this.farmProgram.programId, [
      'rewards_pot',
      farm,
      rewardsMint,
    ]);
  }

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  // --------------------------------------- execute ixs

  async initFarm(
    farm: Keypair,
    farmManager: PublicKey | Keypair,
    payer: PublicKey | Keypair,
    bank: Keypair
  ) {
    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(
      farm.publicKey
    );

    const signers = [farm, bank];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('starting farm at', bank.publicKey.toBase58());
    const txSig = await this.farmProgram.rpc.initFarm(farmAuthBump, {
      accounts: {
        farm: farm.publicKey,
        farmManager: isKp(farmManager)
          ? (<Keypair>farmManager).publicKey
          : farmManager,
        farmAuthority: farmAuth,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : farmManager,
        bank: bank.publicKey,
        gemBank: this.bankProgram.programId,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { farmAuth, farmAuthBump, txSig };
  }

  async initFarmer(
    farm: PublicKey,
    identity: PublicKey | Keypair,
    payer: PublicKey | Keypair
  ) {
    const identityPk = isKp(identity)
      ? (<Keypair>identity).publicKey
      : <PublicKey>identity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await this.findVaultPDA(
      farmAcc.bank,
      identityPk
    );
    const [vaultAuth, vaultAuthBump] = await this.findVaultAuthorityPDA(vault); //nice-to-have

    const signers = [];
    if (isKp(identity)) signers.push(<Keypair>identity);
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
    identity: PublicKey | Keypair,
    unstake: boolean
  ) {
    const identityPk = isKp(identity)
      ? (<Keypair>identity).publicKey
      : <PublicKey>identity;

    const farmAcc = await this.fetchFarmAcc(farm);

    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await this.findVaultPDA(
      farmAcc.bank,
      identityPk
    );
    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(farm);

    const signers = [];
    if (isKp(identity)) signers.push(<Keypair>identity);

    let txSig;
    if (unstake) {
      console.log('unstaking gems for', identityPk.toBase58());
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

  async stake(farm: PublicKey, identity: PublicKey | Keypair) {
    return this.stakeCommon(farm, identity, false);
  }

  async unstake(farm: PublicKey, identity: PublicKey | Keypair) {
    return this.stakeCommon(farm, identity, true);
  }

  async authorizeFunder(
    farm: PublicKey,
    farmManager: PublicKey | Keypair,
    funderToAuthorize: PublicKey
  ) {
    const [authorizationProof, authorizationProofBump] =
      await this.findAuthorizationProofPDA(farm, funderToAuthorize);

    const signers = [];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('authorizing funder', funderToAuthorize.toBase58());
    const txSig = await this.farmProgram.rpc.authorizeFunder(
      authorizationProofBump,
      {
        accounts: {
          farm,
          farmManager: isKp(farmManager)
            ? (<Keypair>farmManager).publicKey
            : farmManager,
          funderToAuthorize,
          authorizationProof,
          systemProgram: SystemProgram.programId,
        },
        signers,
      }
    );

    return { authorizationProof, authorizationProofBump, txSig };
  }

  async fund(
    farm: PublicKey,
    rewardsSource: PublicKey,
    rewardsMint: PublicKey,
    funder: PublicKey | Keypair,
    amount: BN,
    duration: BN
  ) {
    const funderPk = isKp(funder)
      ? (<Keypair>funder).publicKey
      : <PublicKey>funder;

    const [farmAuth, farmAuthBump] = await this.findFarmAuthorityPDA(farm);
    const [authorizationProof, authorizationProofBump] =
      await this.findAuthorizationProofPDA(farm, funderPk);
    const [rdr, rdrBump] = await this.findRdrPDA(funderPk, rewardsMint);
    const [pot, potBump] = await this.findRewardsPotPDA(farm, rewardsMint);

    const signers = [];
    if (isKp(funder)) signers.push(<Keypair>funder);

    const txSig = await this.farmProgram.rpc.fund(
      authorizationProofBump,
      rdrBump,
      potBump,
      amount,
      duration,
      {
        accounts: {
          farm,
          farmAuthority: farmAuth,
          authorizationProof,
          rewardsDepositReceipt: rdr,
          rewardsPot: pot,
          rewardsSource,
          rewardsMint,
          authorizedFunder: funderPk,
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
      authorizationProof,
      authorizationProofBump,
      rdr,
      rdrBump,
      pot,
      potBump,
      txSig,
    };
  }
}
