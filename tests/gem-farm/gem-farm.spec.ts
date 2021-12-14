import * as anchor from '@project-serum/anchor';
import { GemFarmClient } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BN } from '@project-serum/anchor';
import { ITokenData } from '../utils/account';
import { prepGem } from '../utils/gem-common';

chai.use(chaiAsPromised);

describe('gem farm', () => {
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
  let farmerVault: PublicKey;
  let funder: Keypair;

  function printState() {}

  // --------------------------------------- farm

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    funder = await gf.createWallet(100 * LAMPORTS_PER_SOL);
  });

  it('inits farm', async () => {
    await gf.initFarm(farm, farmManager, farmManager, bank);

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert.equal(farmAcc.bank.toBase58(), bank.publicKey.toBase58());
  });

  // --------------------------------------- farmer

  it('inits farmer', async () => {
    const { vault, farmer } = await gf.initFarmer(
      farm.publicKey,
      farmerIdentity,
      farmerIdentity
    );
    farmerVault = vault;

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert.equal(farmerAcc.farm.toBase58(), farm.publicKey.toBase58());
  });

  // --------------------------------------- fund

  it('authorizes funder', async () => {
    const { authorizationProof } = await gf.authorizeFunder(
      farm.publicKey,
      farmManager,
      funder.publicKey
    );

    const authorizationProofAcc = await gf.fetchAuthorizationProofAcc(
      authorizationProof
    );
    assert.equal(
      authorizationProofAcc.authorizedFunder.toBase58,
      funder.publicKey.toBase58
    );
  });

  // it('deauthorizes funder', async () => {
  //   await gf.program.rpc.removeFunder({});
  // });
  //
  // it('funds', async () => {
  //   await gf.program.rpc.fund({});
  // });
  //

  // --------------------------------------- stake & claim

  describe('gem operations', () => {
    let gemAmount: anchor.BN;
    let gemOwner: Keypair;
    let gem: ITokenData;

    beforeEach('creates a fresh gem', async () => {
      ({ gemAmount, gemOwner, gem } = await prepGem(gf, farmerIdentity));
    });

    it('stakes gems', async () => {
      //deposit some gems into the vault
      await gf.depositGem(
        bank.publicKey,
        farmerVault,
        farmerIdentity,
        gemAmount,
        gem.tokenMint,
        gem.tokenAcc,
        farmerIdentity
      );

      const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);

      const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.activeFarmerCount.eq(new BN(1)));

      const vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);

      const farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(gemAmount));
    });

    // it('unstakes gems', async () => {
    //   await gf.farmProgram.rpc.unstake({});
    // });

    // it('claims rewards', async () => {
    //   await gf.program.rpc.claim({});
    // });
  });
});
