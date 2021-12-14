import * as anchor from '@project-serum/anchor';
import { GemFarmClient } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('gem-farm', () => {
  const _provider = anchor.Provider.env();
  const gf = new GemFarmClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state

  const farm = Keypair.generate();
  const bank = Keypair.generate();
  let farmManager: Keypair;
  let farmerIdentity: Keypair;
  let farmer: PublicKey;

  function printState() {}

  // --------------------------------------- farm

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
  });

  it('inits farm', async () => {
    await gf.initFarm(farm, farmManager, farmManager, bank);

    const farmAcc = await gf.fetchFarmPDA(farm.publicKey);
    assert.equal(farmAcc.bank.toBase58(), bank.publicKey.toBase58());
  });

  // --------------------------------------- farmer

  it('inits farmer', async () => {
    ({ farmer } = await gf.initFarmer(
      farm.publicKey,
      farmerIdentity,
      farmerIdentity,
      bank.publicKey
    ));

    const farmerAcc = await gf.fetchFarmerPDA(farmer);
    assert.equal(farmerAcc.farm.toBase58(), farm.publicKey.toBase58());
  });

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
