import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultVariableConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { pause, VariableRateConfig } from '../../../src';

chai.use(chaiAsPromised);

const fastConfig = <VariableRateConfig>{
  amount: new BN(10000),
  durationSec: new BN(2),
};

describe('funding (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(10000, gf.randomInt(1, 3), gf.randomInt(1, 3));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callAuthorize();
  });

  it('funds a new reward', async () => {
    const { pot } = await gf.callFundReward(defaultVariableConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(10000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.rewardEndTs.gt(new BN(0)));

    //variable reward
    const reward = await gf.verifyVariableReward(100);
    assert(reward.rewardLastUpdatedTs.gt(new BN(0)));

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 10000);
  });

  it('funds -> locks', async () => {
    const { pot } = await gf.callFundReward(defaultVariableConfig);

    await gf.callLockReward();

    // ----------------- tests
    //funds
    await gf.verifyFunds(10000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.lockEndTs.eq(times.rewardEndTs));

    //variable reward
    await gf.verifyVariableReward(100);

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 10000);

    //once locked, funding/cancellation ixs should fail
    await expect(gf.callFundReward(defaultVariableConfig)).to.be.rejectedWith(
      '0x1799'
    );
    await expect(gf.callCancelReward()).to.be.rejectedWith('0x1799');
  });

  it('funds -> cancels (no stakers)', async () => {
    await gf.callFundReward(defaultVariableConfig);
    let oldEndTs = (await gf.verifyTimes()).rewardEndTs;

    const { pot } = await gf.callCancelReward();

    // ----------------- tests
    //funds
    await gf.verifyFunds(10000, 10000, 0);

    //times
    const times = await gf.verifyTimes();
    assert(times.durationSec.lt(new BN(5))); //leaving a few sec wiggle room
    assert(times.rewardEndTs.lt(oldEndTs));

    //variable reward
    const reward = await gf.verifyVariableReward(0); //after cancellation goes to 0
    assert(reward.rewardLastUpdatedTs.gt(new BN(0)));

    //token accounts
    await gf.verifyFunderAccContains(10000);
    await gf.verifyPotContains(pot, 0);
  });

  it('funds -> cancels (early stakers = fully accrues)', async () => {
    //prep
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    await gf.callFundReward(fastConfig);
    await gf.verifyVariableReward(5000);

    await pause(2000); //wait till fully accrues

    const { pot } = await gf.callCancelReward();

    // ----------------- tests
    //funds
    await gf.verifyFunds(10000, 0, 10000);

    //times
    await gf.verifyTimes(2); //since we exhausted the reward, duration doesn't change

    //variable reward
    await gf.verifyVariableReward(0); //after cancellation goes to 0

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 10000);
  });

  it('funds -> cancels (late stakers = partially accrues)', async () => {
    await gf.callFundReward(fastConfig);
    await gf.verifyVariableReward(5000);

    //add late stakers (1s naturally passes since last call)
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    await pause(2000); //wait till fully accrues

    const { pot } = await gf.callCancelReward();

    // ----------------- tests
    //funds - expect about 50% refunded / 50% accrued
    const funds = await gf.verifyFunds(10000);
    assert(funds.totalRefunded.gt(new BN(4000)));
    assert(funds.totalRefunded.lt(new BN(6000)));
    assert(funds.totalAccruedToStakers.gt(new BN(4000)));
    assert(funds.totalAccruedToStakers.lt(new BN(6000)));

    //times
    await gf.verifyTimes(2); //since we exhausted the reward, duration doesn't change

    //variable reward
    await gf.verifyVariableReward(0); //after cancellation goes to 0

    //token accounts
    await gf.verifyFunderAccContains(4000, 'gt');
    await gf.verifyPotContains(pot, 6000, 'lt');
  });

  it('funds -> immediately funds again (thus merging 2 rewards)', async () => {
    //prep
    await gf.mintMoreRewards(10000);

    await gf.callFundReward(defaultVariableConfig);
    const oldEndTs = (await gf.verifyTimes()).rewardEndTs;
    const oldUpdateTs = (await gf.verifyVariableReward()).rewardLastUpdatedTs;

    await pause(1000); //to create a difference in timestamps we're testing below

    const { pot } = await gf.callFundReward(defaultVariableConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(20000, 0, 0);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.rewardEndTs.gt(oldEndTs));

    //variable reward
    const reward = await gf.verifyVariableReward(200); //up to 200 after 2 fundings
    assert(reward.rewardLastUpdatedTs.gt(oldUpdateTs));

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 20000);
  });

  it('funds -> exhausts -> funds again', async () => {
    //prep
    await gf.mintMoreRewards(10000);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    await gf.callFundReward(fastConfig);

    await pause(2000); //exhaust the previous one

    const { pot } = await gf.callFundReward(defaultVariableConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(20000, 0, 10000);

    //times
    await gf.verifyTimes(100);

    //variable reward
    await gf.verifyVariableReward(100); //100 from second reward only

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 20000);
  });

  it('funds -> cancels -> funds again', async () => {
    //prep
    await gf.mintMoreRewards(10000);

    await gf.callFundReward(defaultVariableConfig);
    await gf.callCancelReward();
    const { pot } = await gf.callFundReward(defaultVariableConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(20000, 10000, 0);

    //times
    await gf.verifyTimes(100);

    //variable reward
    await gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation

    //token accounts
    await gf.verifyFunderAccContains(10000);
    await gf.verifyPotContains(pot, 10000);
  });

  it('funds -> exhausts -> cancels -> funds again', async () => {
    //prep
    await gf.mintMoreRewards(10000);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    await gf.callFundReward(fastConfig);

    await pause(2000); //exhaust the previous one

    await gf.callCancelReward(); //should be mute, since all rewards accrued

    const { pot } = await gf.callFundReward(defaultVariableConfig);

    // ----------------- tests
    //funds
    await gf.verifyFunds(20000, 0, 10000);

    //times
    await gf.verifyTimes(100);

    //variable reward
    await gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation

    //token accounts
    await gf.verifyFunderAccContains(0);
    await gf.verifyPotContains(pot, 20000);
  });
});
