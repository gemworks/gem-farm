import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { pause, toBN } from '../../utils/types';
import { RewardType } from '../gem-farm.client';

chai.use(chaiAsPromised);

describe('staking (fixed rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(new BN(30000));
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
    await gf.callFundReward(undefined, defaultFixedConfig);
  });

  it('stakes -> accrues -> claims (multi farmer)', async () => {
    // ----------------- stake + accrue
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);
    // await gf.printStructs('staked');

    await pause(6000);

    //manually refresh to update accrued rewards for each farmer
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);
    // await gf.printStructs('refreshed');

    //verify counts
    await gf.verifyStakedGemsAndFarmers(gf.gem1Amount.add(gf.gem2Amount), 2);

    //verify funds
    await gf.verifyAccruedRewardsFixed(30);

    //verify timings
    await gf.verifyFixedRewardTimings(gf.farmer1Identity, false);
    await gf.verifyFixedRewardTimings(gf.farmer2Identity, false);

    // ----------------- claim
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    await gf.verifyClaimedReward(gf.farmer1Identity);
    await gf.verifyClaimedReward(gf.farmer2Identity);
  });

  it('stakes -> accrues -> unstakes (twice) -> claims (multi farmer)', async () => {
    // ----------------- stake + accrue
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);

    //verify timings
    await gf.verifyFixedRewardTimings(gf.farmer1Identity, true);
    await gf.verifyFixedRewardTimings(gf.farmer2Identity, true);

    await pause(6000);

    // ----------------- unstake once
    await gf.unstakeOnceAndVerify(gf.farmer1Identity);
    await gf.unstakeOnceAndVerify(gf.farmer2Identity);

    // verify counts
    await gf.verifyStakedGemsAndFarmers(0, 0);

    // ----------------- unstake twice (to pass cooldown)
    await gf.unstakeTwiceAndVerify(gf.farmer1Identity);
    await gf.unstakeTwiceAndVerify(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(0, 0);

    //verify funds
    await gf.verifyAccruedRewardsFixed(30);

    // ----------------- claim
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    const farmer1ClaimedOld = await gf.verifyClaimedReward(gf.farmer1Identity);
    const farmer2ClaimedOld = await gf.verifyClaimedReward(gf.farmer2Identity);

    // since the farmers are now UNstaked, we can verify no further rewards can be claimed,
    // despite the farm continuing to be active

    await pause(1000); //time for farm as a whole to continue forward

    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    const farmer1ClaimedNew = await gf.verifyClaimedReward(gf.farmer1Identity);
    const farmer2ClaimedNew = await gf.verifyClaimedReward(gf.farmer2Identity);

    assert(farmer1ClaimedNew.eq(farmer1ClaimedOld));
    assert(farmer2ClaimedNew.eq(farmer2ClaimedOld));
  });
});
