import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultVariableConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { pause } from '../../../src';

chai.use(chaiAsPromised);

describe('staking (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(5000000000, gf.randomInt(1, 3), gf.randomInt(1, 3));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.prepGemRarities();
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
    await gf.callFundReward(defaultVariableConfig); //begin funding for 100s
  });

  it('stakes -> accrues -> claims (multi farmer)', async () => {
    // ----------------- stake + accrue
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);

    await pause(5000); //pause for 5s = accrue 5% of funding

    //manually refresh to update accrued rewards for each farmer
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(2);

    //verify funds
    //in theory floor 500, but sometimes it's off by 1-2 due to timing
    await gf.verifyAccruedRewardsVariable(490);

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

    await pause(5000); //pause for 5s = accrue 5% of funding

    // ----------------- unstake once
    await gf.unstakeOnceAndVerify(gf.farmer1Identity);
    await gf.unstakeOnceAndVerify(gf.farmer2Identity);

    // verify counts
    await gf.verifyStakedGemsAndFarmers(0, 0, 0);

    // ----------------- unstake twice (to pass cooldown)
    await gf.unstakeTwiceAndVerify(gf.farmer1Identity);
    await gf.unstakeTwiceAndVerify(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(0, 0, 0);

    //verify funds
    //in theory floor 500, but sometimes it's off by 1-2 due to timing
    await gf.verifyAccruedRewardsVariable(490);

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
