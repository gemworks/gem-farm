import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  GemFarmTester,
  defaultVariableConfig,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import { pause } from '../../utils/types';

chai.use(chaiAsPromised);

describe('staking (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
  });

  it('calculates rewards (multi farmer)', async () => {
    // ----------------- stake
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);
    await gf.printStructs('staked');

    //verify counts
    await gf.verifyStakedGemsAndFarmers(gf.gem1Amount.add(gf.gem2Amount), 2);

    // ----------------- accrue funding
    await gf.callFundReward(defaultVariableConfig); //begin funding for 100s

    await pause(5000); //pause for 5s = accrue 5% of funding

    await gf.callCancelReward(); //cancel so that both are exposed for equal time

    // ----------------- unstake once
    await gf.unstakeOnceAndVerify(gf.farmer1Identity);
    await gf.unstakeOnceAndVerify(gf.farmer2Identity);

    await gf.verifyStakedGemsAndFarmers(0, 0);

    // ----------------- unstake twice (to pass cooldown)
    const farmer1Acc = (await gf.unstakeTwiceAndVerify(
      gf.farmer1Identity
    )) as any;
    const farmer2Acc = (await gf.unstakeTwiceAndVerify(
      gf.farmer2Identity
    )) as any;
    await gf.printStructs('unstaked twice');

    //verify counts
    await gf.verifyStakedGemsAndFarmers(0, 0);

    //verify funds
    //todo revisit when implement Number/Decimal
    const expectedMin = 450; //actual floor is somewhere just below 500, this is due to floor division in update_accrued_reward
    const expectedMax = 1000; //if the test hangs for some reason, more will accrue

    const farmer1Accrued = farmer1Acc[gf.reward].accruedReward;
    const farmer1Ratio =
      gf.gem1Amount.toNumber() /
      (gf.gem1Amount.toNumber() + gf.gem2Amount.toNumber());
    assert(farmer1Accrued.gt(new BN(farmer1Ratio * expectedMin)));
    assert(farmer1Accrued.lt(new BN(farmer1Ratio * expectedMax)));

    const farmer2Accrued = farmer2Acc[gf.reward].accruedReward;
    const farmer2Ratio = 1 - farmer1Ratio;
    assert(farmer2Accrued.gt(new BN(farmer2Ratio * expectedMin)));
    assert(farmer2Accrued.lt(new BN(farmer2Ratio * expectedMax)));

    //verify farmers add up to farm
    await gf.verifyFunds(10000, 0, farmer1Accrued.add(farmer2Accrued));
  });

  // --------------------------------------- claim

  it('claims while staked (multi farmer)', async () => {
    await gf.callFundReward(defaultVariableConfig); //begin funding for 100s
    // (!) do NOT cancel the reward when claiming, we want to make sure funded balance doesn't get sent

    // ----------------- stake & accrue funding
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);
    await gf.printStructs('staked');

    await pause(5000); //pause for 5s = accrue 5% of funding

    // ----------------- unstake
    await gf.unstakeOnceAndVerify(gf.farmer1Identity);
    await gf.unstakeOnceAndVerify(gf.farmer2Identity);
    await gf.unstakeTwiceAndVerify(gf.farmer1Identity);
    await gf.unstakeTwiceAndVerify(gf.farmer2Identity);
    await gf.printStructs('unstaked twice');

    // ----------------- claim once
    await gf.callClaimRewards(gf.farmer1Identity);
    await gf.callClaimRewards(gf.farmer2Identity);
    await gf.printStructs('claimed');

    await gf.verifyClaimedRewards(gf.farmer1Identity);
    await gf.verifyClaimedRewards(gf.farmer2Identity);
  });

  // it('claims while unstaked (multi farmer)', async () => {}
});
