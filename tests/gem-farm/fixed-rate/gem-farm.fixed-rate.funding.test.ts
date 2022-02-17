import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { pause, RewardType } from '../../../src';

chai.use(chaiAsPromised);

describe('funding (fixed rate)', () => {
  let gf = new GemFarmTester();

  let totalGems: BN;

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(30000, gf.randomInt(1, 3), gf.randomInt(1, 3));
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callAuthorize();
    totalGems = gf.calcTotalGems();
  });

  it('funds a new reward', async () => {
    const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(30000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.rewardEndTs.gt(new BN(0)));

    //fixed reward
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 30000);
  });

  it('funds -> locks', async () => {
    const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);

    await gf.callLockReward();

    // ----------------- tests
    //funds
    await gf.verifyFunds(30000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.lockEndTs.eq(times.rewardEndTs));

    //fixed reward
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 30000);

    //once locked, funding/cancellation ixs should fail
    await expect(
      gf.callFundReward(undefined, defaultFixedConfig)
    ).to.be.rejectedWith('0x1799');
    await expect(gf.callCancelReward()).to.be.rejectedWith('0x1799');
  });

  it('funds -> cancels (no stakers)', async () => {
    await gf.callFundReward(undefined, defaultFixedConfig);
    let oldEndTs = (await gf.verifyTimes()).rewardEndTs;

    const { pot } = await gf.callCancelReward();

    // ----------------- tests
    //funds
    await gf.verifyFunds(30000, 30000, 0);

    //times
    const times = await gf.verifyTimes();
    assert(times.durationSec.toNumber() < 10); //since cancelled
    assert(times.rewardEndTs.lt(oldEndTs));

    //fixed reward
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(30000);
    await gf.verifyPotContains(pot, 0);
  });

  it('funds -> gets stakers -> cancels', async () => {
    //need to fund first, or there won't be a config to assign to stakers
    await gf.callFundReward(undefined, defaultFixedConfig);

    //prep
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    //make sure the right amount reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    const { pot } = await gf.callCancelReward();

    //the same amount should still be reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    // ----------------- tests
    //funds
    await gf.verifyFunds(30000, 30000 - 30 * gf.gem1Amount.toNumber(), 0);

    //times
    const times = await gf.verifyTimes();
    assert(times.durationSec.toNumber() < 10); //since cancelled

    //fixed reward - reserve goes down since now it's accrued
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    //token accounts
    await gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
    await gf.verifyPotContains(pot, 30 * gf.gem1Amount.toNumber());
  });

  it('funds -> gets stakers -> waits -> cancels', async () => {
    //need to fund first, or there won't be a config to assign to stakers
    await gf.callFundReward(undefined, defaultFixedConfig);

    //prep
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    //make sure the right amount reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    await pause(6000); //wait till fully accrues

    const { pot } = await gf.callCancelReward();

    //the same amount should still be reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    await gf.callRefreshFarmer(gf.farmer1Identity);

    // ----------------- tests
    //funds
    await gf.verifyFunds(
      30000,
      30000 - 30 * gf.gem1Amount.toNumber(),
      30 * gf.gem1Amount.toNumber()
    );

    //times
    const times = await gf.verifyTimes();
    assert(times.durationSec.toNumber() < 10); //since cancelled

    //fixed reward - reserve goes down since now it's accrued
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
    await gf.verifyPotContains(pot, 30 * gf.gem1Amount.toNumber());
  });

  it('funds -> immediately funds again (thus merging 2 rewards)', async () => {
    //prep
    await gf.mintMoreRewards(30000);

    await gf.callFundReward(undefined, defaultFixedConfig);
    const oldEndTs = (await gf.verifyTimes()).rewardEndTs;

    await pause(1000); //to create a difference in timestamps we're testing below

    const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(60000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.rewardEndTs.gt(oldEndTs));

    //fixed reward
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 60000);
  });

  it('funds -> cancels -> funds again', async () => {
    //prep
    await gf.mintMoreRewards(30000);

    await gf.callFundReward(undefined, defaultFixedConfig);
    await gf.callCancelReward();
    const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(60000, 30000, 0);

    //times
    await gf.verifyTimes(100);

    //fixed reward
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(30000);
    await gf.verifyPotContains(pot, 30000);
  });

  it('funds -> gets stakers -> waits -> cancels -> funds again', async () => {
    //need to fund first, or there won't be a config to assign to stakers
    await gf.callFundReward(undefined, defaultFixedConfig);

    //prep
    await gf.mintMoreRewards(30000);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    //make sure the right amount reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    await pause(6000); //wait till fully accrues

    await gf.callCancelReward();

    //the same amount should still be reserved
    await gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());

    await gf.callRefreshFarmer(gf.farmer1Identity);

    const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(
      60000,
      30000 - 30 * gf.gem1Amount.toNumber(),
      30 * gf.gem1Amount.toNumber()
    );

    //times
    await gf.verifyTimes(100);

    //fixed reward - reserve goes down since now it's accrued
    await gf.verifyFixedReward(0);

    //token accounts
    await gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
    await gf.verifyPotContains(pot, 30000 + 30 * gf.gem1Amount.toNumber());
  });
});
