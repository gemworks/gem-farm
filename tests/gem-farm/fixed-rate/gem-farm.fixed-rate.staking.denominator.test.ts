import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
  fixedConfigWithDenominator,
  GemFarmTester,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import {
  FixedRateConfig,
  pause,
  RewardType,
  toBN,
  WhitelistType,
} from '../../../src';
import { PublicKey } from '@solana/web3.js';
import { createMetadata } from '../../metaplex';

chai.use(chaiAsPromised);

describe('staking (fixed rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(5000000000);
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.prepGemRarities();
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
    await gf.callFundReward(undefined, fixedConfigWithDenominator,);
  });

  it('stakes -> accrues -> claims (multi farmer) -> ONLY ONE DAY -> NEW!', async () => {
    // ----------------- stake + accrue
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);

    await pause(11000);

    //manually refresh to update accrued rewards for each farmer
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(2);

    //verify funds
    const f1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    const f2Reward = await gf.verifyFarmerReward(gf.farmer2Identity);
    assert(f1Reward.accruedReward.eq(gf.gem1Amount.mul(fixedConfigWithDenominator.schedule.baseRate)));
    assert(f2Reward.accruedReward.eq(gf.gem2Amount.mul(fixedConfigWithDenominator.schedule.baseRate)));

    console.log("Running verifyFarmerFixedRewardTimings");
    
    // ----------------- claim
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    // see that the reward is only equal to one interval reward...
    const farmer1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    const paidout = new BN(gf.gem1Amount.mul(fixedConfigWithDenominator.schedule.baseRate));
    assert(paidout.eq(farmer1Reward.paidOutReward));

    await gf.verifyClaimedReward(gf.farmer1Identity);
    await gf.verifyClaimedReward(gf.farmer2Identity);
  });

  it('Multi farmer.. stake -> accure (but not enough) -> attempt to claim before payout period -> get nothing!', async () => {
    // ----------------- stake + accrue
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);

    await pause(5000); // 5s

    //manually refresh to update accrued rewards for each farmer
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(2);

    //verify funds
    //await gf.verifyAccruedRewardsFixedsd();
    const f1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    const f2Reward = await gf.verifyFarmerReward(gf.farmer2Identity);
    assert(f1Reward.accruedReward.eq(new BN(0)));
    assert(f2Reward.accruedReward.eq(new BN(0)));

    // ----------------- claim
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    // see that the reward is only equal to one minute reward...
    const farmer1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    const paidout = new BN(0);
    assert(paidout.eq(farmer1Reward.paidOutReward));

    await gf.verifyClaimedReward(gf.farmer1Identity);
    await gf.verifyClaimedReward(gf.farmer2Identity);
  });

});
