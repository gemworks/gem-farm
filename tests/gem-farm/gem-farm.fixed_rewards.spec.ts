import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import {
  FarmConfig,
  FixedRateConfig,
  GemFarmClient,
  PeriodConfig,
  RewardType,
} from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Token } from '@solana/spl-token';
import { pause } from '../utils/types';
import { prepGem } from '../utils/gem-common';
import { ITokenData } from '../utils/account';
import { printStructsGeneric } from './gem-farm.common';

chai.use(chaiAsPromised);

const _provider = anchor.Provider.env();
const gf = new GemFarmClient(
  _provider.connection,
  _provider.wallet as anchor.Wallet
);

const config = <FixedRateConfig>{
  period1: <PeriodConfig>{
    //per gem per second
    rate: new BN(5),
    //seconds it lasts
    durationSec: new BN(3),
  },
  period2: <PeriodConfig>{
    rate: new BN(10),
    durationSec: new BN(3),
  },
  period3: <PeriodConfig>{
    //setting this to 0 let's us get deterministic test results
    //since the last leg is empty, as long as staking is delayed <6s we don't care
    rate: new BN(0),
    durationSec: new BN(6),
  },
  gemsFunded: new BN(1000),
};

function totalRewardsPerGem() {
  const p1 = config.period1.rate.mul(config.period1.durationSec);
  const p2 = config.period2!.rate.mul(config.period2!.durationSec);
  const p3 = config.period3!.rate.mul(config.period3!.durationSec);

  return p1.add(p2).add(p3);
}

function totalDuration() {
  const p1 = config.period1.durationSec;
  const p2 = config.period2!.durationSec;
  const p3 = config.period3!.durationSec;

  return p1.add(p2).add(p3);
}

function totalRewardsAmount() {
  return config.gemsFunded.mul(totalRewardsPerGem());
}

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
  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;
  let funder = gf.wallet.payer;

  //gem 1 used by farmer 1
  let gem1Amount: anchor.BN;
  let gem1: ITokenData;
  //gem 2 used by farmer 2
  let gem2Amount: anchor.BN;
  let gem2: ITokenData;

  async function printStructs(state: string) {
    await printStructsGeneric(
      gf,
      state,
      farm,
      farmer1Identity,
      farmer2Identity
    );
  }

  async function prepFarmer(identity: Keypair) {
    return gf.initFarmer(farm.publicKey, identity, identity);
  }

  async function prepAuthorization() {
    return gf.authorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  async function prepFunding(rewardMint: PublicKey) {
    return gf.fund(
      farm.publicKey,
      rewardMint,
      rewardMint.toBase58() === rewardA.publicKey.toBase58()
        ? rewardASource
        : rewardBSource,
      funder,
      null,
      config
    );
  }

  beforeEach('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer1Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer2Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardASource = await gf.createAndFundATA(
      rewardA,
      funder,
      totalRewardsAmount()
    );
    rewardB = await gf.createToken(0, funder.publicKey);
    rewardBSource = await gf.createAndFundATA(
      rewardB,
      funder,
      totalRewardsAmount()
    );

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

    //funds the farm
    await prepAuthorization();
    await prepFunding(rewardA.publicKey);
    await prepFunding(rewardB.publicKey);

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(
      // @ts-ignore
      farmAcc.rewardA.fixedRateTracker.netRewardFunding.eq(totalRewardsAmount())
    );
    // @ts-ignore
    assert(farmAcc.rewardA.rewardDurationSec.eq(totalDuration()));
    // @ts-ignore
    assert(farmAcc.rewardA.rewardEndTs.gt(totalDuration()));

    assert(
      // @ts-ignore
      farmAcc.rewardB.fixedRateTracker.netRewardFunding.eq(totalRewardsAmount())
    );
    // @ts-ignore
    assert(farmAcc.rewardB.rewardDurationSec.eq(totalDuration()));
    // @ts-ignore
    assert(farmAcc.rewardB.rewardEndTs.gt(totalDuration()));

    //creates gems
    ({ gemAmount: gem1Amount, gem: gem1 } = await prepGem(gf, farmer1Identity));
    ({ gemAmount: gem2Amount, gem: gem2 } = await prepGem(gf, farmer2Identity));
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

    // ----------------- wait till the end of reward schedule (to accrue full rewards)
    await pause(13000); //1s longer than the schedule

    const { farmer: farmer1 } = await prepRefreshFarmer(farmer1Identity);
    const { farmer: farmer2 } = await prepRefreshFarmer(farmer2Identity);
    await printStructs('WAITED');

    farmAcc = await gf.fetchFarmAcc(farm.publicKey);

    //verify farmer count adds up
    assert(farmAcc.stakedFarmerCount.eq(new BN(2)));

    //verify gem count adds up
    assert(farmAcc.gemsStaked.eq(gem1Amount.add(gem2Amount)));
    assert(
      // @ts-ignore
      farmAcc.gemsStaked.eq(farmAcc.rewardA.fixedRateTracker.gemsParticipating)
    );
    assert(
      // @ts-ignore
      farmAcc.gemsStaked.eq(farmAcc.rewardB.fixedRateTracker.gemsParticipating)
    );

    //verify accrued rewards add up
    const totalAccruedToStakers =
      // @ts-ignore
      farmAcc.rewardA.fixedRateTracker.totalAccruedToStakers;

    const farmer1Acc = await gf.fetchFarmerAcc(farmer1);
    // @ts-ignore
    const accruedFarmer1 = farmer1Acc.rewardA.accruedReward;

    const farmer2Acc = await gf.fetchFarmerAcc(farmer2);
    // @ts-ignore
    const accruedFarmer2 = farmer2Acc.rewardA.accruedReward;

    assert(totalAccruedToStakers.eq(accruedFarmer1.add(accruedFarmer2)));

    //verify reward rate * gems staked = total accrued
    assert(
      totalAccruedToStakers.eq(farmAcc.gemsStaked.mul(totalRewardsPerGem()))
    );

    //verify gems made whole
    assert(
      // @ts-ignore
      farmAcc.rewardA.fixedRateTracker.gemsParticipating.eq(
        // @ts-ignore
        farmAcc.rewardA.fixedRateTracker.gemsMadeWhole
      )
    );
    assert(
      // @ts-ignore
      farmAcc.rewardB.fixedRateTracker.gemsParticipating.eq(
        // @ts-ignore
        farmAcc.rewardB.fixedRateTracker.gemsMadeWhole
      )
    );

    // ----------------- unstake once to move into cooldown
    await unstakeOnce(gem1Amount, farmer1Identity);
    await unstakeOnce(gem1Amount, farmer2Identity);

    // ----------------- unstake second time to actually open up the vault for withdrawing
    await unstakeTwice(gem1Amount, farmer1Identity);
    await unstakeTwice(gem1Amount, farmer2Identity);
    // await printStructs('UNSTAKED');

    farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
    assert(farmAcc.gemsStaked.eq(new BN(0)));
  });

  //todo test can't unfund for too much
  //todo test double funding
  //todo test locking, which should check the funding balance

  // it('defunds the farm', async () => {});
});
