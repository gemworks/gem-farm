import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  GemFarmTester,
  defaultVariableConfig,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { pause } from '../../utils/types';

chai.use(chaiAsPromised);

describe('funding (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callAuthorize();
  });

  // it('funds a new reward', async () => {
  //   const { pot } = await gf.callFundReward(defaultVariableConfig);
  //   await gf.printStructs('FUNDED');
  //
  //   const farmAcc = (await gf.fetchFarm()) as any;
  //
  //   //time tracker
  //   assert(
  //     farmAcc[gf.reward].times.durationSec.eq(defaultVariableConfig.durationSec)
  //   );
  //   assert(!farmAcc[gf.reward].times.rewardEndTs.eq(new BN(0)));
  //   assert(farmAcc[gf.reward].times.lockEndTs.eq(new BN(0)));
  //
  //   //funds tracker
  //   assert(
  //     farmAcc[gf.reward].funds.totalFunded.eq(defaultVariableConfig.amount)
  //   );
  //   assert(farmAcc[gf.reward].funds.totalRefunded.eq(new BN(0)));
  //   assert(farmAcc[gf.reward].funds.totalAccruedToStakers.eq(new BN(0)));
  //
  //   //variable rate reward
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(100)));
  //   assert(farmAcc[gf.reward].variableRate.rewardLastUpdatedTs.gt(new BN(0)));
  //
  //   //verify the pot actually received the money
  //   const rewardsPotAcc = await gf.fetchRewardAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.eq(defaultVariableConfig.amount));
  // });

  async function fundThenCancel(delay?: number) {
    await gf.callFundReward(defaultVariableConfig);

    let farmAcc = (await gf.fetchFarm()) as any;
    assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(100)));
    assert(farmAcc[gf.reward].times.durationSec.eq(new BN(100)));
    let oldEndTs = farmAcc[gf.reward].times.rewardEndTs;

    if (delay) await pause(delay);

    const { pot } = await gf.callCancelReward();
    await gf.printStructs('CANCELLED');

    farmAcc = await gf.fetchFarm();
    assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(0))); //reward rate should go to 0
    assert(farmAcc[gf.reward].times.durationSec.lt(new BN(100))); // expect to go down
    assert(farmAcc[gf.reward].times.rewardEndTs.lt(oldEndTs)); // expect to go down

    return { pot, farmAcc };
  }

  // it('cancels a reward (no stakers)', async () => {
  //   const { pot, farmAcc } = await fundThenCancel();
  //
  //   //since there were no stakers, the entire funding should be returned
  //   assert(
  //     farmAcc[gf.reward].funds.totalRefunded.eq(
  //       farmAcc[gf.reward].funds.totalFunded
  //     )
  //   );
  //
  //   const rewardsPotAcc = await gf.fetchRewardAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.eq(new BN(0)));
  //
  //   const sourceAcc = await gf.fetchRewardAcc(
  //     gf.rewardMint.publicKey,
  //     gf.rewardSource
  //   );
  //   assert(sourceAcc.amount.eq(defaultVariableConfig.amount));
  // });

  // it('cancels a reward (with stakers)', async () => {
  //   await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
  //   await gf.callStake(gf.farmer1Identity);
  //
  //   const { pot, farmAcc } = await fundThenCancel(2000);
  //
  //   //this time there are stakers, so about 2-3% of the reward should have accrued
  //   assert(
  //     farmAcc[gf.reward].funds.totalRefunded.eq(
  //       farmAcc[gf.reward].funds.totalFunded.sub(
  //         farmAcc[gf.reward].funds.totalAccruedToStakers
  //       )
  //     )
  //   );
  //
  //   const accrued = defaultVariableConfig.amount.div(new BN(25));
  //
  //   const rewardsPotAcc = await gf.fetchRewardAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.lte(accrued));
  //
  //   const sourceAcc = await gf.fetchRewardAcc(
  //     gf.rewardMint.publicKey,
  //     gf.rewardSource
  //   );
  //   assert(sourceAcc.amount.gt(defaultVariableConfig.amount.sub(accrued)));
  // });

  // it('funds -> funds a 2nd time (merges)')

  // it('funds -> accrues -> cancels -> funds again', async () => {});

  // it('funds -> exhausts -> funds again')
});
