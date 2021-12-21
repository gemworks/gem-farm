import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  GemFarmTester,
  defaultVariableConfig,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';

chai.use(chaiAsPromised);

describe('funding (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callAuthorize();
  });

  // it('funds the reward', async () => {
  //   const { pot } = await gf.callFundReward(variableConfig);
  //
  //   const farmAcc = await gf.fetchFarm();
  //
  //   //time tracker
  //   // @ts-ignore
  //   assert(farmAcc[gf.reward].times.durationSec.eq(variableConfig.durationSec));
  //   // @ts-ignore - reward end should not be 0
  //   assert(!farmAcc[gf.reward].times.rewardEndTs.eq(new BN(0)));
  //   // @ts-ignore - but lock should, it's not set yet
  //   assert(farmAcc[gf.reward].times.lockEndTs.eq(new BN(0)));
  //
  //   //funds tracker
  //   // @ts-ignore
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(variableConfig.amount));
  //   // @ts-ignore - nothing refunded as of yet
  //   assert(farmAcc[gf.reward].funds.totalRefunded.eq(new BN(0)));
  //   // @ts-ignore - nothing accrued, since nothing staked
  //   assert(farmAcc[gf.reward].funds.totalAccruedToStakers.eq(new BN(0)));
  //
  //   //variable rate reward
  //   // @ts-ignore
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(100)));
  //   assert(
  //     // @ts-ignore - last update should not be 0
  //     !farmAcc[gf.reward].variableRate.rewardLastUpdatedTs.eq(new BN(0))
  //   );
  //
  //   //verify the pot actually received the money
  //   const rewardsPotAcc = await gf.fetchRewardAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.eq(variableConfig.amount));
  // });
  //
  // it('cancels the reward', async () => {
  //   const { pot } = await gf.callCancelReward();
  //   // await printStructs('CANCELLED');
  //
  //   const farmAcc = await gf.fetchFarm();
  //   // @ts-ignore
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(0)));
  //
  //   //since some time will have passed, the pot won't be exactly zeroed out
  //   const fivePercent = variableConfig.amount.div(new BN(20));
  //
  //   const rewardsPotAcc = await gf.fetchRewardAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.lt(variableConfig.amount.sub(fivePercent)));
  //
  //   const sourceAcc = await gf.fetchRewardAcc(
  //     gf.rewardMint.publicKey,
  //     gf.rewardSource
  //   );
  //   assert(sourceAcc.amount.gt(variableConfig.amount.sub(fivePercent)));
  // });

  // it('locks rewards in place', async () => {
  //   // mint a little extra, since some was left in the pot
  //   const fivePercent = variableConfig.amount.div(new BN(20));
  //
  //   // fund again, before we lock
  //   await gf.callFundReward();
  //
  //   await gf.lockReward(
  //     gf.farm.publicKey,
  //     gf.farmManager,
  //     gf.rewardMint.publicKey
  //   );
  //   // await printStructs('LOCKED');
  //
  //   const farmAcc = await gf.fetchFarm();
  //   // @ts-ignore - lock should now be set equal to duration
  //   assert(farmAcc.rewardA.lockEndTs.eq(farmAcc.rewardA.rewardEndTs));
  //
  //   //once locked, no more funding or cancellation is possible
  //   await expect(gf.callFundReward()).to.be.rejectedWith('0x155');
  //   await expect(gf.callCancelReward()).to.be.rejectedWith('0x155');
  // });
});
