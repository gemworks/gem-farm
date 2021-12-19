import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { FarmConfig, GemFarmClient, RewardType } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Token } from '@solana/spl-token';
import { pause, stringifyPubkeysAndBNsInObject } from '../utils/types';
import { prepGem } from '../utils/gem-common';
import { ITokenData } from '../utils/account';

chai.use(chaiAsPromised);

const _provider = anchor.Provider.env();
const gf = new GemFarmClient(
  _provider.connection,
  _provider.wallet as anchor.Wallet
);

describe('gem farm (fixed rewards)', () => {
  //farm + bank
  const bank = Keypair.generate();
  const farm = Keypair.generate();
  const farmConfig = <FarmConfig>{
    minStakingPeriodSec: new BN(0),
    cooldownPeriodSec: new BN(0),
    unstakingFeeLamp: new BN(LAMPORTS_PER_SOL),
  };
  let farmManager: Keypair;

  //farmer 1 + vault
  let farmer1Identity: Keypair;
  let farmer1Vault: PublicKey;
  let farmer2Identity: Keypair;
  let farmer2Vault: PublicKey;

  //rewards + funder
  let rewardAmount = new BN(10000); //10k
  let rewardDurationSec = new BN(100); //at rate 100/s
  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;
  let funder = gf.wallet.payer;

  async function printStructs(state: string) {
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    console.log(`// --------------------------------------- ${state}`);
    console.log('// --------------------------------------- farm');
    console.log(stringifyPubkeysAndBNsInObject(farmAcc));

    const [farmer] = await gf.findFarmerPDA(
      farm.publicKey,
      farmer1Identity.publicKey
    );
    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    console.log('// --------------------------------------- farmer');
    console.log(stringifyPubkeysAndBNsInObject(farmerAcc));
  }

  function rewardNameFromMint(rewardMint: PublicKey) {
    if (rewardMint.toBase58() === rewardA.publicKey.toBase58()) {
      return 'rewardA';
    } else if (rewardMint.toBase58() === rewardB.publicKey.toBase58()) {
      return 'rewardB';
    } else {
      throw new Error('reward mint not recognized');
    }
  }

  async function prepFarmer(identity: Keypair) {
    return gf.initFarmer(farm.publicKey, identity, identity);
  }

  async function prepAuthorization() {
    return gf.authorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  async function prepFunding(rewardMint: PublicKey) {
    const fixedRateConfig = {
      period1: {
        rate: new BN(1),
        duration: new BN(1),
      },
      period2: {
        rate: new BN(1),
        duration: new BN(1),
      },
      period3: {
        rate: new BN(1),
        duration: new BN(1),
      },
    };

    return gf.fund(
      farm.publicKey,
      rewardMint,
      rewardMint.toBase58() === rewardA.publicKey.toBase58()
        ? rewardASource
        : rewardBSource,
      funder,
      rewardAmount,
      rewardDurationSec,
      fixedRateConfig
    );
  }

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer1Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer2Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardASource = await gf.createAndFundATA(rewardA, funder, rewardAmount);
    rewardB = await gf.createToken(0, funder.publicKey);
    rewardBSource = await gf.createAndFundATA(rewardB, funder, rewardAmount);

    //farm
    await gf.initFarm(
      farm,
      farmManager,
      farmManager,
      bank,
      rewardA.publicKey,
      RewardType.Fixed,
      rewardB.publicKey,
      RewardType.Fixed,
      farmConfig
    );

    //farmers
    ({ vault: farmer1Vault } = await prepFarmer(farmer1Identity));
    ({ vault: farmer2Vault } = await prepFarmer(farmer2Identity));

    //funding
    await prepAuthorization();
    await prepFunding(rewardA.publicKey);
    await prepFunding(rewardB.publicKey);
  });

  // --------------------------------------- gem ops: deposit, stake & claim

  describe('gem operations', () => {
    //gem 1 used by farmer 1
    let gem1Amount: anchor.BN;
    let gem1: ITokenData;
    //gem 2 used by farmer 2
    let gem2Amount: anchor.BN;
    let gem2: ITokenData;

    beforeEach('creates a fresh gem', async () => {
      ({ gemAmount: gem1Amount, gem: gem1 } = await prepGem(
        gf,
        farmer1Identity
      ));
      ({ gemAmount: gem2Amount, gem: gem2 } = await prepGem(
        gf,
        farmer2Identity
      ));
    });

    async function prepDeposit(gems: BN, identity: Keypair) {
      const isFarmer1 =
        identity.publicKey.toBase58() === farmer1Identity.publicKey.toBase58();

      return gf.depositGem(
        bank.publicKey,
        isFarmer1 ? farmer1Vault : farmer2Vault,
        identity,
        gems,
        isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
        isFarmer1 ? gem1.tokenAcc : gem2.tokenAcc
      );
    }

    async function prepWithdraw(gems: BN, identity: Keypair) {
      const isFarmer1 =
        identity.publicKey.toBase58() === farmer1Identity.publicKey.toBase58();

      return gf.withdrawGem(
        bank.publicKey,
        isFarmer1 ? farmer1Vault : farmer2Vault,
        identity,
        gems,
        isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
        identity.publicKey
      );
    }

    async function prepRefreshFarmer(identity: Keypair) {
      return gf.refreshFarmer(farm.publicKey, identity);
    }

    async function depositAndStake(gems: BN, identity: Keypair) {
      //deposit some gems into the vault
      await prepDeposit(gems, identity);

      const { farmer, vault } = await gf.stake(farm.publicKey, identity);

      let vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);

      let farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(gems));
    }

    async function unstakeOnce(gems: BN, identity: Keypair) {
      const { vault } = await gf.unstake(farm.publicKey, identity);

      const vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);
    }

    async function unstakeTwice(gems: BN, identity: Keypair) {
      const { farmer, vault } = await gf.unstake(farm.publicKey, identity);

      const vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isFalse(vaultAcc.locked);

      const farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(new BN(0)));
    }

    it('stakes / unstakes gems (multi farmer)', async () => {
      // ----------------- deposit + stake both farmers
      await depositAndStake(gem1Amount, farmer1Identity);
      await depositAndStake(gem2Amount, farmer2Identity);
      await printStructs('STAKED');

      let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(new BN(2)));
      assert(farmAcc.gemsStaked.eq(gem1Amount.add(gem2Amount)));

      // ----------------- wait until the end of reward schedule
      await pause(2000);

      await prepRefreshFarmer(farmer1Identity);
      await prepRefreshFarmer(farmer2Identity);
      await printStructs('WAITED');

      // ----------------- unstake once to move into cooldown
      await unstakeOnce(gem1Amount, farmer1Identity);
      await unstakeOnce(gem1Amount, farmer2Identity);

      // ----------------- unstake second time to actually open up the vault for withdrawing
      await unstakeTwice(gem1Amount, farmer1Identity);
      await unstakeTwice(gem1Amount, farmer2Identity);
      await printStructs('UNSTAKED');

      farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
      assert(farmAcc.gemsStaked.eq(new BN(0)));

      // ----------------- clean up
      // await prepWithdraw(gem1Amount, farmer1Identity);
    });

    // it('stakes / unstakes gems (multi farmer)', async () => {
    //   // ----------------- deposit + stake both farmers
    //   await depositAndStake(gem1Amount, farmer1Identity);
    //   await depositAndStake(gem2Amount, farmer2Identity);
    //   // await printStructs('STAKED');
    //
    //   let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    //   assert(farmAcc.stakedFarmerCount.eq(new BN(2)));
    //   assert(farmAcc.gemsStaked.eq(gem1Amount.add(gem2Amount)));
    //
    //   // ----------------- unstake once to move into cooldown
    //   await unstakeOnce(gem1Amount, farmer1Identity);
    //   await unstakeOnce(gem2Amount, farmer2Identity);
    //
    //   // ----------------- unstake second time to actually open up the vault for withdrawing
    //   await unstakeTwice(gem1Amount, farmer1Identity);
    //   await unstakeTwice(gem2Amount, farmer2Identity);
    //   // await printStructs('UNSTAKED');
    //
    //   farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    //   assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
    //   assert(farmAcc.gemsStaked.eq(new BN(0)));
    // });
  });
});
