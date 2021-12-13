import * as anchor from '@project-serum/anchor';
import { Idl, Program, Provider, Wallet } from '@project-serum/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AccountUtils } from '../utils/account';
import { GemFarm } from '../../target/types/gem_farm';
import { GemBank } from '../../target/types/gem_bank';
import { Connection } from '@metaplex/js';
import { isKp } from '../utils/types';

export class GemFarmClient extends AccountUtils {
  provider: anchor.Provider;
  program!: anchor.Program<GemFarm>;
  bankProgram!: anchor.Program<GemBank>;
  gemBank: PublicKey;

  constructor(
    conn: Connection,
    wallet: Wallet,
    gemBankProgramId: PublicKey,
    idl?: Idl,
    programId?: PublicKey
  ) {
    super(conn, wallet);
    this.provider = new Provider(conn, wallet, Provider.defaultOptions());
    anchor.setProvider(this.provider);
    this.setProgram(idl, programId);
    this.gemBank = gemBankProgramId;
  }

  setProgram(idl?: Idl, programId?: PublicKey) {
    //instantiating program depends on the environment
    if (idl && programId) {
      //means running in prod
      this.program = new anchor.Program<GemFarm>(
        idl as any,
        programId,
        this.provider
      );
    } else {
      //means running inside test suite
      this.program = anchor.workspace.GemFarm as Program<GemFarm>;
    }
  }

  // --------------------------------------- fetch deserialized accounts

  // --------------------------------------- find PDA addresses

  // --------------------------------------- get all PDAs by type
  //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all

  // --------------------------------------- execute ixs

  async startFarm(
    farm: Keypair,
    farmManager: PublicKey | Keypair,
    bank: Keypair
  ) {
    const signers = [farm, bank];
    if (isKp(farmManager)) signers.push(<Keypair>farmManager);

    console.log('starting farm at', bank.publicKey.toBase58());
    const txSig = await this.program.rpc.initFarm({
      accounts: {
        farm: farm.publicKey,
        farmManager: isKp(farmManager)
          ? (<Keypair>farmManager).publicKey
          : farmManager,
        bank: bank.publicKey,
        gemBank: this.gemBank,
        systemProgram: SystemProgram.programId,
      },
      signers,
    });

    return { txSig };
  }
}
