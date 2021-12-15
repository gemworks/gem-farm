import * as anchor from '@project-serum/anchor';
import { GemFarmClient } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BN } from '@project-serum/anchor';
import { ITokenData } from '../utils/account';
import { prepGem } from '../utils/gem-common';
import { Token } from '@solana/spl-token';
import { pause } from '../utils/types';

chai.use(chaiAsPromised);

describe('gem farm', () => {
  const _provider = anchor.Provider.env();
  const gf = new GemFarmClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state

  const bank = Keypair.generate();

  const farm = Keypair.generate();
  let farmManager: Keypair;
  let farmerIdentity: Keypair;

  let rewardAmount = new BN(1000);
  let rewardDurationSec = new BN(2);

  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;

  let farmerVault: PublicKey;

  let funder = gf.wallet.payer;

  function printState() {}

  // --------------------------------------- farm

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardASource = await gf.createAndFundATA(rewardA, funder, rewardAmount);
    rewardB = await gf.createToken(0, funder.publicKey);
    rewardBSource = await gf.createAndFundATA(rewardB, funder, rewardAmount);
  });

  it('inits farm', async () => {
    await gf.initFarm(
      farm,
      farmManager,
      farmManager,
      bank,
      rewardA.publicKey,
      rewardB.publicKey
    );

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert.equal(farmAcc.bank.toBase58(), bank.publicKey.toBase58());
    assert.equal(
      // @ts-ignore
      farmAcc.rewardA.rewardMint.toBase58(),
      rewardA.publicKey.toBase58()
    );
    assert.equal(
      // @ts-ignore
      farmAcc.rewardB.rewardMint.toBase58(),
      rewardB.publicKey.toBase58()
    );
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

  it('funds the farm', async () => {
    const { pot } = await gf.fund(
      farm.publicKey,
      rewardASource,
      rewardA.publicKey,
      funder,
      rewardAmount,
      rewardDurationSec
    );

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.rewardDurationSec.eq(rewardDurationSec));
    // @ts-ignore
    assert(farmAcc.rewardA.totalDepositedAmount.eq(rewardAmount));

    const rewardsAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsAcc.amount.eq(rewardAmount));
  });

  // --------------------------------------- stake & claim

  describe('gem operations', () => {
    let gemAmount: anchor.BN;
    let gemOwner: Keypair;
    let gem: ITokenData;

    async function prepDeposit() {
      await gf.depositGem(
        bank.publicKey,
        farmerVault,
        farmerIdentity,
        gemAmount,
        gem.tokenMint,
        gem.tokenAcc,
        farmerIdentity
      );
    }

    beforeEach('creates a fresh gem', async () => {
      ({ gemAmount, gemOwner, gem } = await prepGem(gf, farmerIdentity));
    });

    it('stakes / unstakes gems', async () => {
      //deposit some gems into the vault
      await prepDeposit();

      //stake
      const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);

      let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.activeFarmerCount.eq(new BN(1)));
      assert(farmAcc.gemsStaked.eq(gemAmount));

      let vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);

      let farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(gemAmount));

      pause(2000);

      //unstake
      await gf.unstake(farm.publicKey, farmerIdentity);

      farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.activeFarmerCount.eq(new BN(0)));
      assert(farmAcc.gemsStaked.eq(new BN(0)));

      vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isFalse(vaultAcc.locked);

      farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(new BN(0)));
    });

    it('claims rewards', async () => {
      const { rewardADestination } = await gf.claim(
        farm.publicKey,
        farmerIdentity,
        rewardA.publicKey,
        rewardB.publicKey
      );

      const rewardADestAcc = await gf.fetchRewardAcc(
        rewardA.publicKey,
        rewardADestination
      );
      console.log(rewardADestAcc.amount);
    });
  });
});
