import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { farmConfig, GemFarmTester } from './gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { pause } from '../utils/types';
import { VariableRateConfig } from './gem-farm.client';

chai.use(chaiAsPromised);

describe('happy path (variable rate)', () => {
  let gf = new GemFarmTester();

  const variableConfig = <VariableRateConfig>{
    amount: new BN(10000),
    durationSec: new BN(3),
  };

  before('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
  });

  it('inits the farm', async () => {
    await gf.callInitFarm(farmConfig);

    const farmAcc = await gf.fetchFarm();
    assert.equal(farmAcc.bank.toBase58(), gf.bank.publicKey.toBase58());
    assert.equal(
      // @ts-ignore
      farmAcc.rewardA.rewardMint.toBase58(),
      gf.rewardMint.publicKey.toBase58()
    );
  });

  // --------------------------------------- farmer

  it('inits farmer', async () => {
    //farmer 1
    let { farmer } = await gf.callInitFarmer(gf.farmer1Identity);

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert.equal(farmerAcc.farm.toBase58(), gf.farm.publicKey.toBase58());

    //farmer 2
    await gf.callInitFarmer(gf.farmer2Identity);
  });

  // --------------------------------------- authorization

  it('authorizes funder', async () => {
    const { authorizationProof } = await gf.callAuthorize();

    const authorizationProofAcc = await gf.fetchAuthorizationProofAcc(
      authorizationProof
    );
    assert.equal(
      authorizationProofAcc.authorizedFunder.toBase58,
      gf.funder.publicKey.toBase58
    );

    // testing idempotency - should NOT throw an error
    await gf.callAuthorize();
  });

  it('deauthorizes funder', async () => {
    const { authorizationProof } = await gf.callDeauthorize();

    await expect(
      gf.fetchAuthorizationProofAcc(authorizationProof)
    ).to.be.rejectedWith('Account does not exist');

    //funding should not be possible now
    await expect(gf.callFundReward()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );

    //second should fail (not idempotent)
    await expect(gf.callDeauthorize()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );
  });

  it('funds the reward', async () => {
    const { pot } = await prepFundReward();

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);

    //reward tracker
    // @ts-ignore
    assert(farmAcc[reward].rewardDurationSec.eq(config.durationSec));
    // @ts-ignore - reward end should not be 0
    assert(!farmAcc[reward].rewardEndTs.eq(new BN(0)));
    // @ts-ignore - but lock should, it's not set yet
    assert(farmAcc[reward].lockEndTs.eq(new BN(0)));

    //variable rate reward tracker
    // @ts-ignore
    assert(farmAcc[reward].variableRateTracker.rewardRate.eq(new BN(100)));
    assert(
      // @ts-ignore
      farmAcc[reward].variableRateTracker.accruedRewardPerGem.eq(new BN(0))
    );
    assert(
      // @ts-ignore
      !farmAcc[reward].variableRateTracker.rewardLastUpdatedTs.eq(new BN(0))
    );

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardMint.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(config.amount));
  });

  it('cancels the reward', async () => {
    const { pot } = await prepCancelReward();
    // await printStructs('CANCELLED');

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.eq(new BN(0)));

    //since some time will have passed, the pot won't be exactly zeroed out
    const fivePercent = config.amount.div(new BN(20));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardMint.publicKey, pot);
    assert(rewardsPotAcc.amount.lt(config.amount.sub(fivePercent)));

    const sourceAcc = await gf.fetchRewardAcc(
      rewardMint.publicKey,
      rewardSource
    );
    assert(sourceAcc.amount.gt(config.amount.sub(fivePercent)));
  });

  it('locks rewards in place', async () => {
    // mint a little extra, since some was left in the pot
    const fivePercent = config.amount.div(new BN(20));

    // fund again, before we lock
    await prepFundReward();

    await gf.lockReward(farm.publicKey, farmManager, rewardMint.publicKey);
    // await printStructs('LOCKED');

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore - lock should now be set equal to duration
    assert(farmAcc.rewardA.lockEndTs.eq(farmAcc.rewardA.rewardEndTs));

    //once locked, no more funding or cancellation is possible
    await expect(prepFundReward()).to.be.rejectedWith('0x155');
    await expect(prepCancelReward()).to.be.rejectedWith('0x155');
  });

  // --------------------------------------- staking

  //total accrued reward must be == gems staked * accrued reward per gem
  //won't work if more than 1 farmers are farming at the same time
  async function verifyAccruedRewardsSingleFarmer(
    identity: Keypair,
    gems?: BN
  ) {
    //farm
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    const rewardPerGem =
      // @ts-ignore
      farmAcc[reward].variableRateTracker.accruedRewardPerGem;

    //farmer
    const [farmer] = await gf.findFarmerPDA(farm.publicKey, identity.publicKey);
    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    // @ts-ignore
    const farmerAccrued = farmerAcc[reward].accruedReward;
    const farmerGems = farmerAcc.gemsStaked;

    // console.log('f1 accrued', farmerAccrued.toNumber());
    // console.log('f1 gems', farmerGems.toNumber());
    // console.log('f1 per gem', rewardPerGem.toNumber());

    assert(farmerAccrued.eq((gems ?? farmerGems).mul(rewardPerGem)));
  }

  async function depositAndStake(gems: BN, identity: Keypair) {
    //deposit some gems into the vault
    await prepDeposit(gems, identity);

    const { farmer, vault } = await gf.stake(farm.publicKey, identity);

    let vaultAcc = await gf.fetchVaultAcc(vault);
    assert.isTrue(vaultAcc.locked);

    let farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(gems));
  }

  async function unstakeOnce(gems: BN, identity: Keypair) {
    const { vault } = await gf.unstake(farm.publicKey, identity);

    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert.isTrue(vaultAcc.locked);
  }

  async function unstakeTwice(gems: BN, identity: Keypair) {
    const { farmer, vault } = await gf.unstake(farm.publicKey, identity);

    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert.isFalse(vaultAcc.locked);

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));
  }

  it('stakes / unstakes gems (single farmer)', async () => {
    // ----------------- deposit + stake both farmers
    await depositAndStake(gem1Amount, farmer1Identity);
    // await printStructs('STAKED');

    await verifyAccruedRewardsSingleFarmer(farmer1Identity);

    let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
    assert(farmAcc.gemsStaked.eq(gem1Amount));

    let treasuryBalance = await gf.fetchTreasuryBalance(farm.publicKey);
    assert.equal(treasuryBalance, 0);

    // ----------------- wait until the end of reward schedule
    await pause(2000);

    await prepRefreshFarmer(farmer1Identity);
    // await printStructs('WAITED');

    await verifyAccruedRewardsSingleFarmer(farmer1Identity);

    // ----------------- unstake once to move into cooldown
    await unstakeOnce(gem1Amount, farmer1Identity);

    await verifyAccruedRewardsSingleFarmer(farmer1Identity, gem1Amount);

    // ----------------- unstake second time to actually open up the vault for withdrawing
    await unstakeTwice(gem1Amount, farmer1Identity);
    // await printStructs('UNSTAKED');

    await verifyAccruedRewardsSingleFarmer(farmer1Identity, gem1Amount);

    farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
    assert(farmAcc.gemsStaked.eq(new BN(0)));

    treasuryBalance = await gf.fetchTreasuryBalance(farm.publicKey);
    assert.equal(treasuryBalance, LAMPORTS_PER_SOL);

    // ----------------- clean up
    await prepWithdraw(gem1Amount, farmer1Identity);
  });

  it('stakes / unstakes gems (multi farmer)', async () => {
    // ----------------- deposit + stake both farmers
    await depositAndStake(gem1Amount, farmer1Identity);
    await depositAndStake(gem2Amount, farmer2Identity);
    // await printStructs('STAKED');

    let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(2)));
    assert(farmAcc.gemsStaked.eq(gem1Amount.add(gem2Amount)));

    // ----------------- unstake once to move into cooldown
    await unstakeOnce(gem1Amount, farmer1Identity);
    await unstakeOnce(gem2Amount, farmer2Identity);

    // ----------------- unstake second time to actually open up the vault for withdrawing
    await unstakeTwice(gem1Amount, farmer1Identity);
    await unstakeTwice(gem2Amount, farmer2Identity);
    // await printStructs('UNSTAKED');

    farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
    assert(farmAcc.gemsStaked.eq(new BN(0)));
  });

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

  it('claims rewards', async () => {
    // stuff before we can claim
    await gf.callAuthorize();
    await gf.callFundReward(variableConfig);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);
    await pause(4000); //exhaust reward

    const { rewardADestination: rewardDest } = await gf.callClaimRewards();
    await gf.printStructs('CLAIMED 1');
    const amount1 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);

    // try to claim a few more times
    // no more rewards should be paid out, since reward ended
    await gf.callClaimRewards();
    await gf.printStructs('CLAIMED 2');
    const amount2 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);

    await gf.callClaimRewards();
    await gf.printStructs('CLAIMED 3');
    const amount3 = await verifyClaimedRewards(gf.farmer1Identity, rewardDest);

    assert(amount1.eq(amount2));
    assert(amount1.eq(amount3));
  });

  // --------------------------------------- flash deposit

  it('flash deposits a gems', async () => {
    //need at least 1 gem to lock the vault
    const initialDeposit = new BN(1);

    await gf.callDeposit(initialDeposit, gf.farmer1Identity);

    //stake
    const { farmer, vault } = await gf.stake(
      gf.farm.publicKey,
      gf.farmer1Identity
    );

    let vaultAcc = await gf.fetchVaultAcc(vault);
    const oldGemsInVault = vaultAcc.gemCount;
    assert.isTrue(vaultAcc.locked);

    let farmAcc = await gf.fetchFarmAcc(gf.farm.publicKey);
    const oldFarmerCount = farmAcc.stakedFarmerCount;
    const oldGemsStaked = farmAcc.gemsStaked;

    let farmerAcc = await gf.fetchFarmerAcc(farmer);
    const oldBeginTs = farmerAcc.beginStakingTs;
    const oldEndTs = farmerAcc.minStakingEndsTs;
    assert(farmerAcc.gemsStaked.eq(oldGemsInVault));

    //flash deposit after vault locked
    const flashDeposit = new BN(1);

    await gf.callFlashDeposit(flashDeposit);
    // await printStructs('FLASH DEPOSITS');

    vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(oldGemsInVault.add(flashDeposit)));
    assert.isTrue(vaultAcc.locked);

    farmAcc = await gf.fetchFarmAcc(gf.farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(oldFarmerCount));
    assert(farmAcc.gemsStaked.eq(oldGemsStaked.add(flashDeposit)));

    farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(oldGemsInVault.add(flashDeposit)));
    //flash deposits resets staking time
    assert(farmerAcc.beginStakingTs.gte(oldBeginTs));
    assert(farmerAcc.minStakingEndsTs.gte(oldEndTs));
  });

  // --------------------------------------- treasury payout

  async function prepTreasuryPayout(destination: PublicKey) {
    return gf.payoutFromTreasury(
      gf.farm.publicKey,
      gf.farmManager,
      destination,
      new BN(LAMPORTS_PER_SOL)
    );
  }

  it('pays out from treasury', async () => {
    const destination = await gf.createWallet(0);

    await prepTreasuryPayout(destination.publicKey);

    const balance = await gf.getBalance(destination.publicKey);
    assert.equal(balance, LAMPORTS_PER_SOL);
  });
});
