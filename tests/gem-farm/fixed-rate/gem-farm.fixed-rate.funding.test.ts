// import chai, { assert, expect } from 'chai';
// import chaiAsPromised from 'chai-as-promised';
// import {
//   defaultFarmConfig,
//   undefined,
//   defaultFixedConfig,
//   GemFarmTester,
// } from '../gem-farm.tester';
// import { BN } from '@project-serum/anchor';
// import { pause } from '../../utils/types';
// import { RewardType, VariableRateConfig } from '../gem-farm.client';
//
// chai.use(chaiAsPromised);
//
// const fastConfig = <VariableRateConfig>{
//   amount: new BN(45000),
//   durationSec: new BN(2),
// };
//
// describe.skip('funding (fixed rate)', () => {
//   let gf = new GemFarmTester();
//
//   let totalGems: BN;
//
//   beforeEach('preps accs', async () => {
//     await gf.prepAccounts(45000);
//     await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
//     await gf.callInitFarmer(gf.farmer1Identity);
//     await gf.callAuthorize();
//     totalGems = gf.gem1Amount.add(gf.gem2Amount);
//   });
//
//   it('funds a new reward', async () => {
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(45000, 0, 0);
//
//     //times
//     const times = await gf.verifyTimes(6);
//     assert(times.rewardEndTs.gt(new BN(0)));
//
//     //fixed reward
//     await gf.verifyFixedReward(0, 0);
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 45000);
//   });
//
//   it('funds -> locks', async () => {
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     await gf.callLockReward();
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(45000, 0, 0);
//
//     //times
//     const times = await gf.verifyTimes(6);
//     assert(times.lockEndTs.eq(times.rewardEndTs));
//
//     //fixed reward
//     await gf.verifyFixedReward(0, 0);
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 45000);
//
//     //once locked, funding/cancellation ixs should fail
//     await expect(
//       gf.callFundReward(undefined, defaultFixedConfig)
//     ).to.be.rejectedWith('0x155');
//     await expect(gf.callCancelReward()).to.be.rejectedWith('0x155');
//   });
//
//   it('funds -> cancels (no stakers)', async () => {
//     await gf.callFundReward(undefined, defaultFixedConfig);
//     let oldEndTs = (await gf.verifyTimes()).rewardEndTs;
//
//     const { pot } = await gf.callCancelReward();
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(45000, 45000, 0);
//
//     //times
//     const times = await gf.verifyTimes(0);
//     assert(times.rewardEndTs.lt(oldEndTs));
//
//     //fixed reward
//     await gf.verifyFixedReward(0, 0);
//
//     //token accounts
//     await gf.verifyFunderAccContains(45000);
//     await gf.verifyPotContains(pot, 0);
//   });
//
//   it('funds -> cancels (early stakers = fully accrues)', async () => {
//     //prep
//     await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
//     await gf.callStake(gf.farmer1Identity);
//
//     await gf.callFundReward(undefined, defaultFixedConfig);
//
//     await pause(6000); //wait till fully accrues
//
//     const { pot } = await gf.callCancelReward();
//
//     //farmers need to refresh themselves to be made whole
//     await gf.callRefreshFarmer(gf.farmer1Identity);
//     await gf.callRefreshFarmer(gf.farmer2Identity);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(45000, 0, 45000);
//
//     //times
//     await gf.verifyTimes(6);
//
//     //fixed reward
//     await gf.verifyFixedReward(totalGems, totalGems);
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 45000);
//     //todo stopped here
//   });
//
//   it('funds -> cancels (late stakers = partially accrues)', async () => {
//     await gf.callFundReward(fastConfig);
//     await gf.verifyVariableReward(5000);
//
//     //add late stakers (1s naturally passes since last call)
//     await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
//     await gf.callStake(gf.farmer1Identity);
//
//     await pause(2000); //wait till fully accrues
//
//     const { pot } = await gf.callCancelReward();
//
//     // ----------------- tests
//     //funds - expect about 50% refunded / 50% accrued
//     const funds = await gf.verifyFunds(45000);
//     assert(funds.totalRefunded.gt(new BN(4000)));
//     assert(funds.totalRefunded.lt(new BN(6000)));
//     assert(funds.totalAccruedToStakers.gt(new BN(4000)));
//     assert(funds.totalAccruedToStakers.lt(new BN(6000)));
//
//     //times
//     await gf.verifyTimes(2); //since we exhausted the reward, duration doesn't change
//
//     //fixed reward
//     await gf.verifyVariableReward(0); //after cancellation goes to 0
//
//     //token accounts
//     await gf.verifyFunderAccContains(4000, 'gt');
//     await gf.verifyPotContains(pot, 6000, 'lt');
//   });
//
//   it('funds -> immediately funds again (thus merging 2 rewards)', async () => {
//     //prep
//     await gf.mintMoreRewards(45000);
//
//     await gf.callFundReward(undefined, defaultFixedConfig);
//     const oldEndTs = (await gf.verifyTimes()).rewardEndTs;
//     const oldUpdateTs = (await gf.verifyVariableReward()).rewardLastUpdatedTs;
//
//     await pause(1000); //to create a difference in timestamps we're testing below
//
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(20000, 0, 0);
//
//     //times
//     const times = await gf.verifyTimes(100);
//     assert(times.rewardEndTs.gt(oldEndTs));
//
//     //fixed reward
//     const reward = await gf.verifyVariableReward(200); //up to 200 after 2 fundings
//     assert(reward.rewardLastUpdatedTs.gt(oldUpdateTs));
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 20000);
//   });
//
//   it('funds -> exhausts -> funds again', async () => {
//     //prep
//     await gf.mintMoreRewards(45000);
//     await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
//     await gf.callStake(gf.farmer1Identity);
//
//     await gf.callFundReward(fastConfig);
//
//     await pause(2000); //exhaust the previous one
//
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(20000, 0, 45000);
//
//     //times
//     await gf.verifyTimes(100);
//
//     //fixed reward
//     await gf.verifyVariableReward(100); //100 from second reward only
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 20000);
//   });
//
//   it('funds -> cancels -> funds again', async () => {
//     //prep
//     await gf.mintMoreRewards(45000);
//
//     await gf.callFundReward(undefined, defaultFixedConfig);
//     await gf.callCancelReward();
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(20000, 45000, 0);
//
//     //times
//     await gf.verifyTimes(100);
//
//     //fixed reward
//     await gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation
//
//     //token accounts
//     await gf.verifyFunderAccContains(45000);
//     await gf.verifyPotContains(pot, 45000);
//   });
//
//   it('funds -> exhausts -> cancels -> funds again', async () => {
//     //prep
//     await gf.mintMoreRewards(45000);
//     await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
//     await gf.callStake(gf.farmer1Identity);
//
//     await gf.callFundReward(fastConfig);
//
//     await pause(2000); //exhaust the previous one
//
//     await gf.callCancelReward(); //should be mute, since all rewards accrued
//
//     const { pot } = await gf.callFundReward(undefined, defaultFixedConfig);
//
//     // ----------------- tests
//     //funds
//     await gf.verifyFunds(20000, 0, 45000);
//
//     //times
//     await gf.verifyTimes(100);
//
//     //fixed reward
//     await gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation
//
//     //token accounts
//     await gf.verifyFunderAccContains(0);
//     await gf.verifyPotContains(pot, 20000);
//   });
// });
