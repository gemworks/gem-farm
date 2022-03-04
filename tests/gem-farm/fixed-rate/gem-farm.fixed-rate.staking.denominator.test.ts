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

describe('staking (fixed rate w/ denominator)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(5000000000, 1, 1);
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.prepGemRarities();
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
    await gf.callFundReward(undefined, fixedConfigWithDenominator);
  });

  it('stakes -> refresh before first reward (2s) -> lastUpdatedTs no change -> refresh after first reward (14s) -> lastUpdatedTs change (10s) -> refresh farmer (18s) -> no change in lastUpdatedTs(10s)', async () => {
    // ----------------- stake + accrue
    const farmer1 = await gf.stakeAndVerify(gf.farmer1Identity);
    const farmer2 = await gf.stakeAndVerify(gf.farmer2Identity);

    let lastUpdatedTs1 = new BN(
      gf.reward === 'rewardA' ?
      farmer1.rewardA.fixedRate['lastUpdatedTs'] :
      farmer1.rewardB.fixedRate['lastUpdatedTs']
    );
    let lastUpdatedTs2 = new BN(
      gf.reward === 'rewardA' ?
      farmer2.rewardA.fixedRate['lastUpdatedTs'] :
      farmer2.rewardB.fixedRate['lastUpdatedTs']
    );

    await pause(2000); // 2s

    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    let f1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    let f2Reward = await gf.verifyFarmerReward(gf.farmer2Identity);

    await gf.verifyStakedGemsAndFarmers(2);

    // lastUpdated should be the same because it's before denominator
    assert(lastUpdatedTs1.eq(f1Reward.fixedRate.lastUpdatedTs));
    assert(lastUpdatedTs2.eq(f2Reward.fixedRate.lastUpdatedTs));

    await pause(12000); // 14s

    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    //verify funds
    f1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    f2Reward = await gf.verifyFarmerReward(gf.farmer2Identity);

    // the time should be updated now to just previous time + denominator (not +16s)
    assert(lastUpdatedTs1.eq(f1Reward.fixedRate.lastUpdatedTs.sub(fixedConfigWithDenominator.schedule.denominator)));
    assert(lastUpdatedTs2.eq(f2Reward.fixedRate.lastUpdatedTs.sub(fixedConfigWithDenominator.schedule.denominator)));
    
    lastUpdatedTs1 = f1Reward.fixedRate.lastUpdatedTs;
    lastUpdatedTs2 = f2Reward.fixedRate.lastUpdatedTs;

    await pause(4000); // 18s

    f1Reward = await gf.verifyFarmerReward(gf.farmer1Identity);
    f2Reward = await gf.verifyFarmerReward(gf.farmer2Identity);

    // time should be the same as before
    assert(lastUpdatedTs1.eq(f1Reward.fixedRate.lastUpdatedTs));
    assert(lastUpdatedTs2.eq(f2Reward.fixedRate.lastUpdatedTs));

    // ----------------- claim
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);

    // see that the reward is only equal to one interval reward...
    await gf.verifyClaimedReward(gf.farmer1Identity);
    await gf.verifyClaimedReward(gf.farmer2Identity);
  });

});
