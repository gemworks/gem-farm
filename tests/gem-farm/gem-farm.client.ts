import * as anchor from '@project-serum/anchor';
import { Idl, Program, Wallet } from '@project-serum/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { GemFarm } from '../../target/types/gem_farm';
import { Connection } from '@metaplex/js';
import { isKp } from '../utils/types';
import { GemBankClient } from '../gem-bank/gem-bank.client';

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

  async fetchFarmPDA(farm: PublicKey) {
    return this.farmProgram.account.farm.fetch(farm);
  }

  async fetchFarmerPDA(farmer: PublicKey) {
    return this.farmProgram.account.farmer.fetch(farmer);
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
    payer: PublicKey | Keypair,
    bank: PublicKey
  ) {
    const identityPk = isKp(identity)
      ? (<Keypair>identity).publicKey
      : <PublicKey>identity;

    const [farmer, farmerBump] = await this.findFarmerPDA(farm, identityPk);
    const [vault, vaultBump] = await this.findVaultPDA(bank, identityPk);
    const [vaultAuth] = await this.findVaultAuthorityPDA(vault); //nice-to-have

    const signers = [];
    if (isKp(identity)) signers.push(<Keypair>identity);
    if (isKp(payer)) signers.push(<Keypair>payer);

    const txSig = await this.farmProgram.rpc.initFarmer(farmerBump, vaultBump, {
      accounts: {
        farm,
        farmer,
        identity: isKp(identity) ? (<Keypair>identity).publicKey : identity,
        payer: isKp(payer) ? (<Keypair>payer).publicKey : payer,
        bank,
        vault,
        gemBank: this.bankProgram.programId,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { farmer, farmerBump, vault, vaultBump, vaultAuth, txSig };
  }
}
