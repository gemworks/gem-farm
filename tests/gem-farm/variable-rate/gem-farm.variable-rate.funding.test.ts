import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  GemFarmTester,
  defaultVariableConfig,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { pause } from '../../utils/types';
import { VariableRateConfig } from '../gem-farm.client';
import { PublicKey } from '@solana/web3.js';

chai.use(chaiAsPromised);

const fastConfig = <VariableRateConfig>{
  amount: new BN(10000),
  durationSec: new BN(2),
};

const fastConfig2 = <VariableRateConfig>{
  amount: new BN(50000),
  durationSec: new BN(2),
};

describe('funding (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(10000);
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callAuthorize();
  });

  it('funds a new reward', async () => {
    const { pot } = await gf.callFundReward(defaultVariableConfig);
    await gf.printStructs('FUNDED');

    //funds
    await gf.verifyFunds(10000, 0, 0);
    await gf.assertFundsAddUp(10000);

    //times
    const times = await gf.verifyTimes(100);
    assert(times.rewardEndTs.gt(new BN(0)));

    //variable reward
    const reward = await gf.verifyVariableReward(100);
    assert(reward.rewardLastUpdatedTs.gt(new BN(0)));

    //token accounts
    await gf.assertFunderAccContains(0);
    await gf.assertPotContains(pot, 10000);
  });

  // async function fundThenCancel(delay?: number, config?: VariableRateConfig) {
  //   await gf.callFundReward(config ?? defaultVariableConfig);
  //
  //   let farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(100)));
  //   assert(farmAcc[gf.reward].times.durationSec.eq(new BN(100)));
  //   let oldEndTs = farmAcc[gf.reward].times.rewardEndTs;
  //
  //   if (delay) await pause(delay);
  //
  //   const { pot } = await gf.callCancelReward();
  //   await gf.printStructs('CANCELLED');
  //
  //   farmAcc = await gf.fetchFarm();
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(0))); //reward rate should go to 0
  //   assert(farmAcc[gf.reward].times.durationSec.lt(new BN(100))); // expect to go down
  //   assert(farmAcc[gf.reward].times.rewardEndTs.lt(oldEndTs)); // expect to go down
  //
  //   return { pot, farmAcc };
  // }

  // it('funds -> cancels (no stakers)', async () => {
  //   const { pot, farmAcc } = await fundThenCancel();
  //
  //   //since there were no stakers, the entire funding should be returned
  //   assert(
  //     farmAcc[gf.reward].funds.totalRefunded.eq(
  //       farmAcc[gf.reward].funds.totalFunded
  //     )
  //   );
  //
  //   await assertPotContains(pot, new BN(0));
  //   await assertFunderAccContains(defaultVariableConfig.amount);
  // });

  // it('funds -> cancels (early stakers == fully accrues)', async () => {
  //   await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
  //   await gf.callStake(gf.farmer1Identity);
  //
  //   //pause for 2s = for 2% of total duration
  //   const { pot, farmAcc } = await fundThenCancel(2000);
  //
  //   //1/33rd = about 3%, just > 2% above
  //   const accruedUpperBound = defaultVariableConfig.amount.div(new BN(33));
  //
  //   await assertFundsMatchAfterRefund(farmAcc);
  //   await assertPotContains(pot, accruedUpperBound, 'lt');
  //   await assertFunderAccContains(
  //     defaultVariableConfig.amount.sub(accruedUpperBound),
  //     'gt'
  //   );
  // });

  // it('funds -> cancels (late stakers == doesnt fully accrue)', async () => {
  //   //launch a fast reward
  //   const { pot } = await gf.callFundReward(fastConfig);
  //
  //   await pause(1000);
  //
  //   //this time we stake late
  //   await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
  //   await gf.callStake(gf.farmer1Identity);
  //
  //   //wait for it to complete
  //   await pause(2000);
  //
  //   await gf.callCancelReward();
  //
  //   const farmAcc = (await gf.fetchFarm()) as any;
  //
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(fastConfig.amount));
  //   //should be < 10k
  //   assert(
  //     farmAcc[gf.reward].funds.totalAccruedToStakers.lt(fastConfig.amount)
  //   );
  //   assert(farmAcc[gf.reward].funds.totalRefunded.gt(new BN(0)));
  //
  //   await assertFundsMatchAfterRefund(farmAcc);
  //   await assertPotContains(pot, fastConfig.amount, 'lt');
  //   await assertFunderAccContains(new BN(0), 'gt');
  // });

  // it('funds -> funds again (merges 1st one exhausted)', async () => {
  //   //we'll need more tokens to be sent to the pool
  //   await gf.mintMoreRewards(10000);
  //
  //   await gf.callFundReward(defaultVariableConfig);
  //   let farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(new BN(10000)));
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(100)));
  //
  //   await gf.callFundReward(defaultVariableConfig);
  //   farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(new BN(20000)));
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(200)));
  // });

  // it('funds -> cancels -> funds again', async () => {});
  //
  // async function fundAndExhaust() {
  //   //stake some gems, so accrual works
  //   await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
  //   await gf.callStake(gf.farmer1Identity);
  //
  //   //launch a fast reward
  //   await gf.callFundReward(fastConfig);
  //
  //   //wait for it to complete
  //   await pause(2000);
  //
  //   //refresh
  //   await gf.callRefreshFarmer(gf.farmer1Identity);
  //   let farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(new BN(10000)));
  //   assert(farmAcc[gf.reward].funds.totalAccruedToStakers.eq(new BN(10000)));
  //   assert(farmAcc[gf.reward].funds.totalRefunded.eq(new BN(0)));
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(5000)));
  //
  //   return farmAcc;
  // }
  //
  // it('funds -> exhausts -> funds again', async () => {
  //   let farmAcc = await fundAndExhaust();
  //   let oldRewardEnd = farmAcc[gf.reward].times.rewardEndTs;
  //
  //   //mint + fund
  //   await gf.mintMoreRewards(50000);
  //   await gf.callFundReward(fastConfig2);
  //
  //   farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(new BN(60000)));
  //   assert(farmAcc[gf.reward].funds.totalAccruedToStakers.eq(new BN(10000)));
  //   assert(farmAcc[gf.reward].funds.totalRefunded.eq(new BN(0)));
  //   //the reward rate should update to just the new one
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(25000)));
  //   //end ts should have been updated
  //   assert(farmAcc[gf.reward].times.rewardEndTs.gt(oldRewardEnd));
  // });
  //
  // it('funds -> exhausts -> cancels -> funds again', async () => {});
});
