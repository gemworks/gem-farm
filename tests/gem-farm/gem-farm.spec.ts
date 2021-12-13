import * as anchor from '@project-serum/anchor';
import { GemFarmClient } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { GemBank } from '../../target/types/gem_bank';

describe('gem-farm', () => {
  const _provider = anchor.Provider.env();
  const _gemBank = anchor.workspace.GemBank as Program<GemBank>;

  const gf = new GemFarmClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet,
    _gemBank.programId
  );

  // --------------------------------------- state

  const farm = Keypair.generate();
  const bank = Keypair.generate();
  let farmManager: Keypair;

  function printState() {}

  // --------------------------------------- farm

  beforeEach('generates accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
  });

  it('inits farm', async () => {
    await gf.startFarm(farm, farmManager, bank);
  });

  // --------------------------------------- farmer

  // it('inits farmer', async () => {
  //   await gf.program.rpc.initFarmer({});
  // });
  //
  // // --------------------------------------- stake
  //
  // it('stakes', async () => {
  //   await gf.program.rpc.stake({});
  // });
  //
  // it('unstakes', async () => {
  //   await gf.program.rpc.unstake({});
  // });
  //
  // // --------------------------------------- fund
  //
  // it('adds funder', async () => {
  //   await gf.program.rpc.addFunder({});
  // });
  //
  // it('removes funder', async () => {
  //   await gf.program.rpc.removeFunder({});
  // });
  //
  // it('funds', async () => {
  //   await gf.program.rpc.fund({});
  // });
  //
  // // --------------------------------------- claim
  //
  // it('claims', async () => {
  //   await gf.program.rpc.claim({});
  // });
});
