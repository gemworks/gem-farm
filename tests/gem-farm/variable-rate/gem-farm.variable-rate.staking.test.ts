import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  GemFarmTester,
  defaultVariableConfig,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

chai.use(chaiAsPromised);

describe('staking (variable rate)', () => {
  let gf = new GemFarmTester();

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
    await gf.callInitFarm(defaultFarmConfig);
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callAuthorize();
  });

  // --------------------------------------- stake

  // //total accrued reward must be == gems staked * accrued reward per gem
  // //won't work if more than 1 farmers are farming at the same time
  // async function verifyAccruedRewardsSingleFarmer(
  //   identity: Keypair,
  //   gems?: BN
  // ) {
  //   //farm
  //   const farmAcc = await gf.fetchFarm();
  //   const rewardPerGem =
  //     // @ts-ignore
  //     farmAcc[gf.reward].variableRate.accruedRewardPerGem;
  //
  //   //farmer
  //   const [farmer] = await gf.findFarmerPDA(gf.farm.publicKey, identity.publicKey);
  //   const farmerAcc = await gf.fetchFarmerAcc(farmer);
  //   // @ts-ignore
  //   const farmerAccrued = farmerAcc[gf.reward].accruedReward;
  //   const farmerGems = farmerAcc.gemsStaked;
  //
  //   // console.log('f1 accrued', farmerAccrued.toNumber());
  //   // console.log('f1 gems', farmerGems.toNumber());
  //   // console.log('f1 per gem', rewardPerGem.toNumber());
  //
  //   assert(farmerAccrued.eq((gems ?? farmerGems).mul(rewardPerGem)));
  // }
  //
  // async function depositAndStake(gems: BN, identity: Keypair) {
  //   //deposit some gems into the vault
  //   await gf.callDeposit(gems, identity);
  //
  //   const { farmer, vault } = await gf.callStake(identity);
  //
  //   let vaultAcc = await gf.fetchVaultAcc(vault);
  //   assert.isTrue(vaultAcc.locked);
  //
  //   let farmerAcc = await gf.fetchFarmerAcc(farmer);
  //   assert(farmerAcc.gemsStaked.eq(gems));
  // }
  //
  // async function unstakeOnce(gems: BN, identity: Keypair) {
  //   const { vault } = await gf.callUnstake(identity);
  //
  //   const vaultAcc = await gf.fetchVaultAcc(vault);
  //   assert.isTrue(vaultAcc.locked);
  // }
  //
  // async function unstakeTwice(gems: BN, identity: Keypair) {
  //   const { farmer, vault } = await gf.callUnstake(identity);
  //
  //   const vaultAcc = await gf.fetchVaultAcc(vault);
  //   assert.isFalse(vaultAcc.locked);
  //
  //   const farmerAcc = await gf.fetchFarmerAcc(farmer);
  //   assert(farmerAcc.gemsStaked.eq(new BN(0)));
  // }
  //
  // it('stakes / unstakes gems (single farmer)', async () => {
  //   // ----------------- deposit + stake both farmers
  //   await depositAndStake(gf.gem1Amount, gf.farmer1Identity);
  //   // await printStructs('STAKED');
  //
  //   await verifyAccruedRewardsSingleFarmer(gf.farmer1Identity);
  //
  //   let farmAcc = await gf.fetchFarm();
  //   assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
  //   assert(farmAcc.gemsStaked.eq(gf.gem1Amount));
  //
  //   let treasuryBalance = await gf.fetchTreasuryBal();
  //   assert.equal(treasuryBalance, 0);
  //
  //   // ----------------- wait until the end of reward schedule
  //   await pause(2000);
  //
  //   await gf.callRefreshFarmer(gf.farmer1Identity);
  //   // await printStructs('WAITED');
  //
  //   await verifyAccruedRewardsSingleFarmer(gf.farmer1Identity);
  //
  //   // ----------------- unstake once to move into cooldown
  //   await unstakeOnce(gf.gem1Amount, gf.farmer1Identity);
  //
  //   await verifyAccruedRewardsSingleFarmer(gf.farmer1Identity, gf.gem1Amount);
  //
  //   // ----------------- unstake second time to actually open up the vault for withdrawing
  //   await unstakeTwice(gf.gem1Amount, gf.farmer1Identity);
  //   // await printStructs('UNSTAKED');
  //
  //   await verifyAccruedRewardsSingleFarmer(gf.farmer1Identity, gf.gem1Amount);
  //
  //   farmAcc = await gf.fetchFarm();
  //   assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
  //   assert(farmAcc.gemsStaked.eq(new BN(0)));
  //
  //   treasuryBalance = await gf.fetchTreasuryBal();
  //   assert.equal(treasuryBalance, LAMPORTS_PER_SOL);
  //
  //   // ----------------- clean up
  //   await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);
  // });
  //
  // it('stakes / unstakes gems (multi farmer)', async () => {
  //   // ----------------- deposit + stake both farmers
  //   await depositAndStake(gf.gem1Amount, gf.farmer1Identity);
  //   await depositAndStake(gf.gem2Amount, gf.farmer2Identity);
  //   // await printStructs('STAKED');
  //
  //   let farmAcc = await gf.fetchFarm();
  //   assert(farmAcc.stakedFarmerCount.eq(new BN(2)));
  //   assert(farmAcc.gemsStaked.eq(gf.gem1Amount.add(gf.gem2Amount)));
  //
  //   // ----------------- unstake once to move into cooldown
  //   await unstakeOnce(gf.gem1Amount, gf.farmer1Identity);
  //   await unstakeOnce(gf.gem2Amount, gf.farmer2Identity);
  //
  //   // ----------------- unstake second time to actually open up the vault for withdrawing
  //   await unstakeTwice(gf.gem1Amount, gf.farmer1Identity);
  //   await unstakeTwice(gf.gem2Amount, gf.farmer2Identity);
  //   // await printStructs('UNSTAKED');
  //
  //   farmAcc = await gf.fetchFarm();
  //   assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
  //   assert(farmAcc.gemsStaked.eq(new BN(0)));
  // });
  //
  // --------------------------------------- claim

  async function verifyClaimedRewards(
    identity: Keypair,
    rewardDest: PublicKey
  ) {
    const [farmer] = await gf.findFarmerPDA(
      gf.farm.publicKey,
      identity.publicKey
    );
    const rewardDestAcc = await gf.fetchRewardAcc(
      gf.rewardMint.publicKey,
      rewardDest
    );
    const farmerAcc = await gf.fetchFarmerAcc(farmer);

    //verify reward paid out == reward accrued
    assert(
      // @ts-ignore
      farmerAcc[gf.reward].paidOutReward.eq(farmerAcc[gf.reward].accruedReward)
    );

    //verify reward paid out = what's actually in the wallet
    // @ts-ignore
    assert(rewardDestAcc.amount.eq(farmerAcc[gf.reward].paidOutReward));

    return rewardDestAcc.amount;
  }

  // it('claims rewards', async () => {
  //   // stuff before we can claim
  //   await gf.callAuthorize();
  //   await gf.callFundReward(variableConfig);
  //   await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
  //   await gf.callStake(gf.farmer1Identity);
  //
  //   //todo ok to be fair this probably should be tested with unstaking
  //   await pause(4000); //exhaust reward
  //
  //   const { rewardADestination: rewardDest } = await gf.callClaimRewards();
  //   await gf.printStructs('CLAIMED 1');
  //   const amount1 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);
  //
  //   // try to claim a few more times
  //   // no more rewards should be paid out, since reward ended
  //   await gf.callClaimRewards();
  //   await gf.printStructs('CLAIMED 2');
  //   const amount2 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);
  //
  //   await gf.callClaimRewards();
  //   await gf.printStructs('CLAIMED 3');
  //   const amount3 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);
  //
  //   assert(amount1.eq(amount2));
  //   assert(amount1.eq(amount3));
  // });
});
