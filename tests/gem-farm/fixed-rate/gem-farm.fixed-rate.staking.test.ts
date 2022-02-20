import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
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

const shortFixedConfig = <FixedRateConfig>{
  schedule: {
    baseRate: toBN(3),
    tier1: null,
    tier2: null,
    tier3: null,
    denominator: toBN(1),
  },
  amount: new BN(30000),
  durationSec: new BN(5), //5s only
};

describe('staking (fixed rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(5000000000, gf.randomInt(1, 3), gf.randomInt(1, 3));
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.prepGemRarities();
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

    await pause(6000);

    //manually refresh to update accrued rewards for each farmer
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    //verify counts
    await gf.verifyStakedGemsAndFarmers(2);

    //verify funds
    await gf.verifyAccruedRewardsFixed(30);

    //verify timings
    await gf.verifyFarmerFixedRewardTimings(gf.farmer1Identity, false);
    await gf.verifyFarmerFixedRewardTimings(gf.farmer2Identity, false);

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
    await gf.verifyFarmerFixedRewardTimings(gf.farmer1Identity, true);
    await gf.verifyFarmerFixedRewardTimings(gf.farmer2Identity, true);

    await pause(6000);

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

  it('voids reserved amount after farmers unstake', async () => {
    let totalReserve = gf.calcTotalGemRarity().total.mul(toBN(30));

    //both stake
    await gf.stakeAndVerify(gf.farmer1Identity);
    await gf.stakeAndVerify(gf.farmer2Identity);

    await gf.verifyFixedReward(totalReserve); //full reserve in place

    //accrue some time
    await pause(1000);

    //both unstake
    await gf.unstakeOnceAndVerify(gf.farmer1Identity);
    await gf.unstakeOnceAndVerify(gf.farmer2Identity);

    const reward = await gf.verifyFixedReward();
    assert(reward.reservedAmount.lt(totalReserve)); //less than full, since some accrued
    assert(reward.reservedAmount.gt(0));

    //we still need to refresh the farmers to void the rewards (remember fixed only updates when farmer passed)
    await gf.callRefreshFarmer(gf.farmer1Identity);
    await gf.callRefreshFarmer(gf.farmer2Identity);

    await gf.verifyFixedReward(0); //finally reserve is empty
  });

  it('rolls the farmer forward after expiry', async () => {
    await gf.mintMoreRewards(60000);

    //we need to reset funding schedule to a shorter one
    await gf.callFundReward(undefined, shortFixedConfig);

    const times = await gf.verifyTimes();
    assert(times.durationSec.eq(toBN(5)));

    //stake + exhaust the schedule
    await gf.stakeAndVerify(gf.farmer1Identity);
    await pause(5000);

    const originalStakedTs = (await gf.verifyFarmerReward(gf.farmer1Identity))
      .fixedRate.beginStakingTs;

    //need to refresh the farmer to push them into graduation
    await gf.callRefreshFarmer(gf.farmer1Identity);

    //we'll know we've succeeded when reserved funds are 0
    await gf.verifyFixedReward(0);

    //we want the timestamp to be preserved
    const newStakedTs = (await gf.verifyFarmerReward(gf.farmer1Identity))
      .fixedRate.beginStakingTs;
    assert(originalStakedTs.eq(newStakedTs));

    //now let's throw in another reward
    await gf.callFundReward(undefined, defaultFixedConfig);

    //refresh the farmer to get them in
    await gf.callRefreshFarmer(gf.farmer1Identity);

    //expect them to be "rolled" - ie on the new schedule, but with old TS
    const fixed = (await gf.verifyFarmerReward(gf.farmer1Identity)).fixedRate;
    assert(fixed.beginStakingTs.eq(originalStakedTs));
    assert(fixed.beginStakingTs.lt(fixed.beginScheduleTs));
    assert(fixed.promisedDuration.gte(toBN(90)));
  });

  //todo ideally needs a variable rate counterpart (less concerning tho)
  it('flash deposits a gem', async () => {
    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);

    //stake to lock the vault
    const { farmer, vault } = await gf.callStake(gf.farmer1Identity);

    let vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit));
    assert(
      vaultAcc.rarityPoints.eq(initialDeposit.mul(toBN(gf.gem1PerGemRarity)))
    );
    assert.isTrue(vaultAcc.locked);

    let farmAcc = await gf.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
    assert(farmAcc.gemsStaked.eq(initialDeposit));
    assert(
      vaultAcc.rarityPoints.eq(initialDeposit.mul(toBN(gf.gem1PerGemRarity)))
    );

    let farmerAcc = (await gf.fetchFarmerAcc(farmer)) as any;
    assert(farmerAcc.gemsStaked.eq(initialDeposit));
    assert(
      farmerAcc.rarityPointsStaked.eq(
        initialDeposit.mul(toBN(gf.gem1PerGemRarity))
      )
    );
    const oldEndTs = farmerAcc.minStakingEndsTs;
    const originalBeginStakingTs =
      farmerAcc[gf.reward].fixedRate.beginStakingTs;
    const originalBeginScheduleTs =
      farmerAcc[gf.reward].fixedRate.beginScheduleTs;
    const originalDuration = farmerAcc[gf.reward].fixedRate.promisedDuration;

    //wait for 1 sec so that flash deposit staking time is recorded as different
    await pause(1000);

    //flash deposit after vault locked
    const flashDeposit = new BN(1);

    await gf.callFlashDeposit(flashDeposit, gf.farmer1Identity);
    // await printStructs('FLASH DEPOSITS');

    let newGems = initialDeposit.add(flashDeposit);
    let newRarity = initialDeposit
      .add(flashDeposit)
      .mul(toBN(gf.gem1PerGemRarity));

    await pause(1000);
    vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(newGems));
    assert(vaultAcc.rarityPoints.eq(newRarity));
    assert.isTrue(vaultAcc.locked);

    farmAcc = await gf.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
    assert(farmAcc.gemsStaked.eq(newGems));
    assert(farmAcc.rarityPointsStaked.eq(newRarity));

    farmerAcc = (await gf.fetchFarmerAcc(farmer)) as any;
    assert(farmerAcc.gemsStaked.eq(newGems));
    assert(farmerAcc.rarityPointsStaked.eq(newRarity));
    //flash deposits resets staking time, which means it should be higher
    assert(farmerAcc.minStakingEndsTs.gt(oldEndTs));

    //check to make sure schedule renewed, but original staking TS preserved
    const newBeginStakingTs = farmerAcc[gf.reward].fixedRate.beginStakingTs;
    const newBeginScheduleTs = farmerAcc[gf.reward].fixedRate.beginScheduleTs;
    const newDuration = farmerAcc[gf.reward].fixedRate.promisedDuration;
    assert(originalBeginStakingTs.eq(newBeginStakingTs));
    assert(originalBeginScheduleTs.lt(newBeginScheduleTs));
    assert(originalDuration.gt(newDuration)); //since less time left on schedule
  });

  it('flash deposits a gem (whitelisted mint)', async () => {
    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist mint
    const { whitelistProof } = await gf.callAddToBankWhitelist(
      gf.gem1.tokenMint,
      WhitelistType.Mint
    );

    //flash deposit after vault locked
    const flashDeposit = new BN(1);
    await gf.callFlashDeposit(flashDeposit, gf.farmer1Identity, whitelistProof);

    //this is enough to verify it worked
    await pause(1000);
    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(flashDeposit)));
    assert(
      vaultAcc.rarityPoints.eq(
        initialDeposit.add(flashDeposit).mul(toBN(gf.gem1PerGemRarity))
      )
    );
    assert.isTrue(vaultAcc.locked);
  });

  it('flash deposits a gem (whitelisted creator)', async () => {
    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist creator
    const gemMetadata = await createMetadata(
      gf.conn,
      gf.nw.wallet,
      gf.gem1.tokenMint
    );

    const { whitelistProof } = await gf.callAddToBankWhitelist(
      gf.nw.wallet.publicKey,
      WhitelistType.Creator
    );

    //flash deposit after vault locked
    const flashDeposit = new BN(1);
    await gf.callFlashDeposit(
      flashDeposit,
      gf.farmer1Identity,
      PublicKey.default,
      gemMetadata,
      whitelistProof
    );

    //this is enough to verify it worked
    await pause(1000);
    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(flashDeposit)));
    assert(
      vaultAcc.rarityPoints.eq(
        initialDeposit.add(flashDeposit).mul(toBN(gf.gem1PerGemRarity))
      )
    );
    assert.isTrue(vaultAcc.locked);
  });
});
