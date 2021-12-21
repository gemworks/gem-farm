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
  //   const rewardsPotAcc = await gf.fetchTokenAcc(gf.rewardMint.publicKey, pot);
  //   assert(rewardsPotAcc.amount.eq(defaultVariableConfig.amount));
  // });

  async function fundThenCancel(delay?: number, config?: VariableRateConfig) {
    await gf.callFundReward(config ?? defaultVariableConfig);

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

  async function assertPotContains(pot: PublicKey, amount: BN, sign?: string) {
    const rewardsPotAcc = await gf.fetchTokenAcc(gf.rewardMint.publicKey, pot);
    switch (sign) {
      case 'lt':
        assert(rewardsPotAcc.amount.lt(amount));
        break;
      default:
        assert(rewardsPotAcc.amount.eq(amount));
    }
  }

  async function assertFunderAccContains(amount: BN, sign?: string) {
    const sourceAcc = await gf.fetchTokenAcc(
      gf.rewardMint.publicKey,
      gf.rewardSource
    );
    switch (sign) {
      case 'gt':
        assert(sourceAcc.amount.gt(amount));
        break;
      default:
        assert(sourceAcc.amount.eq(amount));
    }
  }

  async function assertFundsMatchAfterRefund(farmAcc: any) {
    assert(
      farmAcc[gf.reward].funds.totalRefunded.eq(
        farmAcc[gf.reward].funds.totalFunded.sub(
          farmAcc[gf.reward].funds.totalAccruedToStakers
        )
      )
    );
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
  //   await assertPotContains(pot, new BN(0));
  //   await assertFunderAccContains(defaultVariableConfig.amount);
  // });

  // it('cancels a reward (with early stakers == fully accrues)', async () => {
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

  it('cancels a reward (with late stakers == doesnt fully accrue)', async () => {
    //launch a fast reward
    const { pot } = await gf.callFundReward(fastConfig);

    await pause(1000);

    //this time we stake late
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);

    //wait for it to complete
    await pause(2000);

    await gf.callCancelReward();

    const farmAcc = (await gf.fetchFarm()) as any;

    assert(farmAcc[gf.reward].funds.totalFunded.eq(fastConfig.amount));
    //should be < 10k
    assert(
      farmAcc[gf.reward].funds.totalAccruedToStakers.lt(fastConfig.amount)
    );
    assert(farmAcc[gf.reward].funds.totalRefunded.gt(new BN(0)));

    await assertFundsMatchAfterRefund(farmAcc);
    await assertPotContains(pot, fastConfig.amount, 'lt');
    await assertFunderAccContains(new BN(0), 'gt');
  });

  // it('funds -> funds a 2nd time (merges)', async () => {
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

  // it('funds -> exhausts -> funds again', async () => {
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
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(5000)));
  //
  //   //we'll need more tokens to be sent to the pool
  //   await gf.mintMoreRewards(50000);
  //
  //   //fund again
  //   await gf.callFundReward(fastConfig2);
  //
  //   farmAcc = (await gf.fetchFarm()) as any;
  //   assert(farmAcc[gf.reward].funds.totalFunded.eq(new BN(60000)));
  //   assert(farmAcc[gf.reward].funds.totalAccruedToStakers.eq(new BN(10000)));
  //   //most important - the reward rate should update to just the new one
  //   assert(farmAcc[gf.reward].variableRate.rewardRate.eq(new BN(25000)));
  // });

  // it('funds -> accrues -> cancels -> funds again', async () => {});
});
