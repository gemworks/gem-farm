import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { FarmConfig, GemFarmClient, RewardType } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Token } from '@solana/spl-token';
import { pause, stringifyPubkeysAndBNsInObject } from '../utils/types';
import { prepGem } from '../utils/gem-common';
import { ITokenData } from '../utils/account';

chai.use(chaiAsPromised);

const _provider = anchor.Provider.env();
const gf = new GemFarmClient(
  _provider.connection,
  _provider.wallet as anchor.Wallet
);

describe('gem farm (no min staking / cooldown)', () => {
  //farm + bank
  const bank = Keypair.generate();
  const farm = Keypair.generate();
  const farmConfig = <FarmConfig>{
    minStakingPeriodSec: new BN(0),
    cooldownPeriodSec: new BN(0),
    unstakingFeeLamp: new BN(LAMPORTS_PER_SOL),
  };
  let farmManager: Keypair;

  //farmer 1 + vault
  let farmer1Identity: Keypair;
  let farmer1Vault: PublicKey;
  let farmer2Identity: Keypair;
  let farmer2Vault: PublicKey;

  //rewards + funder
  let rewardAmount = new BN(10000); //10k
  let rewardDurationSec = new BN(100); //at rate 100/s
  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;
  let funder = gf.wallet.payer;

  async function printStructs(state: string) {
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    console.log(`// --------------------------------------- ${state}`);
    console.log('// --------------------------------------- farm');
    console.log(stringifyPubkeysAndBNsInObject(farmAcc));

    const [farmer] = await gf.findFarmerPDA(
      farm.publicKey,
      farmer1Identity.publicKey
    );
    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    console.log('// --------------------------------------- farmer');
    console.log(stringifyPubkeysAndBNsInObject(farmerAcc));
  }

  function rewardNameFromMint(rewardMint: PublicKey) {
    if (rewardMint.toBase58() === rewardA.publicKey.toBase58()) {
      return 'rewardA';
    } else if (rewardMint.toBase58() === rewardB.publicKey.toBase58()) {
      return 'rewardB';
    } else {
      throw new Error('reward mint not recognized');
    }
  }

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer1Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmer2Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardASource = await gf.createAndFundATA(rewardA, funder, rewardAmount);
    rewardB = await gf.createToken(0, funder.publicKey);
    rewardBSource = await gf.createAndFundATA(rewardB, funder, rewardAmount);
  });

  // --------------------------------------- farm

  it('inits farm', async () => {
    await gf.initFarm(
      farm,
      farmManager,
      farmManager,
      bank,
      rewardA.publicKey,
      RewardType.Variable,
      rewardB.publicKey,
      RewardType.Variable,
      farmConfig
    );

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert.equal(farmAcc.bank.toBase58(), bank.publicKey.toBase58());
    assert.equal(
      // @ts-ignore
      farmAcc.rewardA.rewardMint.toBase58(),
      rewardA.publicKey.toBase58()
    );
    assert.equal(
      // @ts-ignore
      farmAcc.rewardB.rewardMint.toBase58(),
      rewardB.publicKey.toBase58()
    );
  });

  // --------------------------------------- farmer

  async function prepFarmer(identity: Keypair) {
    return gf.initFarmer(farm.publicKey, identity, identity);
  }

  it('inits farmer', async () => {
    //farmer 1
    let { vault, farmer } = await prepFarmer(farmer1Identity);
    farmer1Vault = vault;

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert.equal(farmerAcc.farm.toBase58(), farm.publicKey.toBase58());

    //farmer 2
    ({ vault: farmer2Vault } = await prepFarmer(farmer2Identity));
  });

  // --------------------------------------- authorization

  async function prepAuthorization() {
    return gf.authorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  async function prepDeauthorization() {
    return gf.deauthorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  it('authorizes funder', async () => {
    const { authorizationProof } = await prepAuthorization();

    const authorizationProofAcc = await gf.fetchAuthorizationProofAcc(
      authorizationProof
    );
    assert.equal(
      authorizationProofAcc.authorizedFunder.toBase58,
      funder.publicKey.toBase58
    );

    // testing idempotency - should NOT throw an error
    await prepAuthorization();
  });

  it('deauthorizes funder', async () => {
    const { authorizationProof } = await prepDeauthorization();

    await expect(
      gf.fetchAuthorizationProofAcc(authorizationProof)
    ).to.be.rejectedWith('Account does not exist');

    //funding should not be possible now
    await expect(prepFunding(rewardA.publicKey)).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );

    //second should fail (not idempotent)
    await expect(prepDeauthorization()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );
  });

  // --------------------------------------- funding

  async function prepFunding(rewardMint: PublicKey) {
    return gf.fund(
      farm.publicKey,
      rewardMint,
      rewardMint.toBase58() === rewardA.publicKey.toBase58()
        ? rewardASource
        : rewardBSource,
      funder,
      rewardAmount,
      rewardDurationSec
    );
  }

  async function prepDefunding(amount: BN, duration?: BN) {
    return gf.defund(
      farm.publicKey,
      rewardA.publicKey,
      funder,
      amount,
      duration
    );
  }

  async function verifyFunding(
    rewardMint: PublicKey,
    pot: PublicKey,
    fundingReceipt: PublicKey
  ) {
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(!farmAcc.rewardsLastUpdatedTs.eq(new BN(0)));

    const reward = rewardNameFromMint(rewardMint);

    // @ts-ignore
    assert(farmAcc[reward].rewardDurationSec.eq(rewardDurationSec));
    // @ts-ignore - reward end should not be 0
    assert(!farmAcc[reward].rewardEndTs.eq(new BN(0)));
    // @ts-ignore - but lock should, it's not set yet
    assert(farmAcc[reward].lockEndTs.eq(new BN(0)));
    // @ts-ignore
    assert(farmAcc[reward].variableRateTracker.rewardRate.eq(new BN(100)));
    assert(
      // @ts-ignore
      farmAcc[reward].variableRateTracker.accruedRewardPerGem.eq(new BN(0))
    );
    // @ts-ignore
    assert(farmAcc[reward].rewardDurationSec.eq(new BN(100)));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardMint, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert.equal(frAcc.funder.toBase58(), funder.publicKey.toBase58());
    assert(frAcc.totalDepositedAmount.eq(rewardAmount));
    assert(frAcc.depositCount.eq(new BN(1)));
  }

  it('funds the farm', async () => {
    // need to authorize again
    await prepAuthorization();

    //reward A
    const { pot: pot1, fundingReceipt: fr1 } = await prepFunding(
      rewardA.publicKey
    );
    await verifyFunding(rewardA.publicKey, pot1, fr1);

    //reward B
    let { pot: pot2, fundingReceipt: fr2 } = await prepFunding(
      rewardB.publicKey
    );
    // await printStructs('FARM FUNDED');

    await verifyFunding(rewardB.publicKey, pot2, fr2);
  });

  it('defunds the farm', async () => {
    //must be smaller than what's left unaccrued, or will not be able to withdraw
    const defundAmount = new BN(1000);

    const { pot, fundingReceipt } = await prepDefunding(defundAmount);
    // await printStructs('FARM DEFUNDED');

    //new RR = new reward / previous duration. Due to how calcs are done can be off by a bit
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.gt(new BN(85)));
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.lt(new BN(95)));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount.sub(defundAmount)));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert(frAcc.totalWithdrawnAmount.eq(defundAmount));
    assert(frAcc.withdrawalCount.eq(new BN(1)));
  });

  it('locks rewards in place', async () => {
    await gf.lockFunding(farm.publicKey, farmManager, rewardA.publicKey);
    // await printStructs('REWARDS LOCKED');

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore - lock should now be set equal to duration
    assert(farmAcc.rewardA.lockEndTs.eq(farmAcc.rewardA.rewardEndTs));

    //once locked, no more funding or defunding is possible
    await expect(prepFunding(rewardA.publicKey)).to.be.rejectedWith('0x155');
    await expect(prepDefunding(new BN(100))).to.be.rejectedWith('0x155');
  });

  // --------------------------------------- gem ops: deposit, stake & claim

  describe('gem operations', () => {
    //gem 1 used by farmer 1
    let gem1Amount: anchor.BN;
    let gem1: ITokenData;
    //gem 2 used by farmer 2
    let gem2Amount: anchor.BN;
    let gem2: ITokenData;

    beforeEach('creates a fresh gem', async () => {
      ({ gemAmount: gem1Amount, gem: gem1 } = await prepGem(
        gf,
        farmer1Identity
      ));
      ({ gemAmount: gem2Amount, gem: gem2 } = await prepGem(
        gf,
        farmer2Identity
      ));
    });

    async function prepDeposit(gems: BN, identity: Keypair) {
      const isFarmer1 =
        identity.publicKey.toBase58() === farmer1Identity.publicKey.toBase58();

      return gf.depositGem(
        bank.publicKey,
        isFarmer1 ? farmer1Vault : farmer2Vault,
        identity,
        gems,
        isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
        isFarmer1 ? gem1.tokenAcc : gem2.tokenAcc
      );
    }

    async function prepWithdraw(gems: BN, identity: Keypair) {
      const isFarmer1 =
        identity.publicKey.toBase58() === farmer1Identity.publicKey.toBase58();

      return gf.withdrawGem(
        bank.publicKey,
        isFarmer1 ? farmer1Vault : farmer2Vault,
        identity,
        gems,
        isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
        identity.publicKey
      );
    }

    async function prepRefreshFarmer(identity: Keypair) {
      return gf.refreshFarmer(farm.publicKey, identity);
    }

    //won't work if more than 1 farmers are farming at the same time
    async function verifyAccruedRewardsSingleFarmer(
      identity: Keypair,
      gems?: BN
    ) {
      await verifyAccruedRewardByMint(rewardA.publicKey, identity, gems);
      await verifyAccruedRewardByMint(rewardB.publicKey, identity, gems);
    }

    //total accrued reward must be == gems staked * accrued reward per gem
    async function verifyAccruedRewardByMint(
      rewardMint: PublicKey,
      identity: Keypair,
      gems?: BN //sometimes we want to pass custom gem number, eg after unstaking
    ) {
      const reward = rewardNameFromMint(rewardMint);

      //farm
      const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      const rewardPerGem =
        // @ts-ignore
        farmAcc[reward].variableRateTracker.accruedRewardPerGem;

      //farmer
      const [farmer] = await gf.findFarmerPDA(
        farm.publicKey,
        identity.publicKey
      );
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

    async function prepClaimRewards() {
      return gf.claim(
        farm.publicKey,
        farmer1Identity,
        rewardA.publicKey,
        rewardB.publicKey
      );
    }

    async function verifyClaimedRewards(
      identity: Keypair,
      rewardADestination: PublicKey,
      rewardBDestination: PublicKey
    ) {
      const a = await verifyClaimedRewardByMint(
        farmer1Identity,
        rewardA.publicKey,
        rewardADestination
      );
      const b = await verifyClaimedRewardByMint(
        farmer1Identity,
        rewardB.publicKey,
        rewardBDestination
      );

      return [a, b];
    }

    async function verifyClaimedRewardByMint(
      identity: Keypair,
      rewardMint: PublicKey,
      rewardDest: PublicKey
    ) {
      const reward = rewardNameFromMint(rewardMint);
      const [farmer] = await gf.findFarmerPDA(
        farm.publicKey,
        identity.publicKey
      );
      const rewardDestAcc = await gf.fetchRewardAcc(rewardMint, rewardDest);
      const farmerAcc = await gf.fetchFarmerAcc(farmer);

      assert(
        // @ts-ignore
        farmerAcc[reward].paidOutReward.eq(farmerAcc[reward].accruedReward)
      );

      // @ts-ignore
      assert(rewardDestAcc.amount.eq(farmerAcc[reward].paidOutReward));

      return rewardDestAcc.amount;
    }

    it('claims rewards', async () => {
      const { rewardADestination, rewardBDestination } =
        await prepClaimRewards();
      await printStructs('CLAIMED 1');

      const [oldA, oldB] = await verifyClaimedRewards(
        farmer1Identity,
        rewardADestination,
        rewardBDestination
      );

      // try to claim again
      await prepClaimRewards();
      await printStructs('CLAIMED 2');

      // no more rewards should be paid out, since the farmer isn't staked anymore
      const [newA, newB] = await verifyClaimedRewards(
        farmer1Identity,
        rewardADestination,
        rewardBDestination
      );

      assert.equal(oldA.toString(), newA.toString());
      assert.equal(oldB.toString(), newB.toString());
    });

    // --------------------------------------- flash deposit

    async function prepFlashDeposit(gemAmount: BN) {
      return gf.flashDeposit(
        farm.publicKey,
        farmer1Identity,
        gemAmount,
        gem1.tokenMint,
        gem1.tokenAcc
      );
    }

    it('flash deposits a gems', async () => {
      //need at least 1 gem to lock the vault
      const initialDeposit = new BN(1);

      await prepDeposit(initialDeposit, farmer1Identity);

      //stake
      const { farmer, vault } = await gf.stake(farm.publicKey, farmer1Identity);

      let vaultAcc = await gf.fetchVaultAcc(vault);
      const oldGemsInVault = vaultAcc.gemCount;
      assert.isTrue(vaultAcc.locked);

      let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      const oldFarmerCount = farmAcc.stakedFarmerCount;
      const oldGemsStaked = farmAcc.gemsStaked;

      let farmerAcc = await gf.fetchFarmerAcc(farmer);
      const oldBeginTs = farmerAcc.beginStakingTs;
      const oldEndTs = farmerAcc.minStakingEndsTs;
      assert(farmerAcc.gemsStaked.eq(oldGemsInVault));

      //flash deposit after vault locked
      const flashDeposit = new BN(1);

      await prepFlashDeposit(flashDeposit);
      // await printStructs('FLASH DEPOSITS');

      vaultAcc = await gf.fetchVaultAcc(vault);
      assert(vaultAcc.gemCount.eq(oldGemsInVault.add(flashDeposit)));
      assert.isTrue(vaultAcc.locked);

      farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(oldFarmerCount));
      assert(farmAcc.gemsStaked.eq(oldGemsStaked.add(flashDeposit)));

      farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(oldGemsInVault.add(flashDeposit)));
      //flash deposits resets staking time
      assert(farmerAcc.beginStakingTs.gte(oldBeginTs));
      assert(farmerAcc.minStakingEndsTs.gte(oldEndTs));
    });

    // --------------------------------------- misc

    async function prepTreasuryPayout(destination: PublicKey) {
      return gf.payoutFromTreasury(
        farm.publicKey,
        farmManager,
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
});

describe('gem farm (w/ min staking / cooldown)', () => {
  //farm + bank
  const bank = Keypair.generate();
  const farm = Keypair.generate();
  const farmConfig = <FarmConfig>{
    minStakingPeriodSec: new BN(5),
    cooldownPeriodSec: new BN(5),
    unstakingFeeLamp: new BN(0),
  };
  let farmManager: Keypair;

  //farmer + vault
  let farmerIdentity: Keypair;
  let farmerVault: PublicKey;

  //rewards + funder
  let rewardA: Token;
  let rewardB: Token;
  let funder: Keypair;

  //gems
  let gemAmount: anchor.BN;
  let gem: ITokenData;

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    funder = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardB = await gf.createToken(0, funder.publicKey);

    //farm
    await gf.initFarm(
      farm,
      farmManager,
      farmManager,
      bank,
      rewardA.publicKey,
      RewardType.Variable,
      rewardB.publicKey,
      RewardType.Variable,
      farmConfig
    );

    //farmer
    const { vault } = await gf.initFarmer(
      farm.publicKey,
      farmerIdentity,
      farmerIdentity
    );
    farmerVault = vault;

    //gem
    ({ gemAmount, gem } = await prepGem(gf, farmerIdentity));
  });

  async function prepDeposit(gemAmount: BN) {
    return gf.depositGem(
      bank.publicKey,
      farmerVault,
      farmerIdentity,
      gemAmount,
      gem.tokenMint,
      gem.tokenAcc
    );
  }

  async function prepWithdrawal(gemAmount: BN) {
    return gf.withdrawGem(
      bank.publicKey,
      farmerVault,
      farmerIdentity,
      gemAmount,
      gem.tokenMint,
      farmerIdentity.publicKey
    );
  }

  it('moves through farmer lifecycle (unstaked -> staked -> cooldown)', async () => {
    //deposit some gems into the vault
    await prepDeposit(gemAmount);

    //stake
    const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);

    //unstaking fails, since min period not passed
    await expect(gf.unstake(farm.publicKey, farmerIdentity)).to.be.rejectedWith(
      '0x156'
    );

    await pause(6000);

    //begin cooldown
    await gf.unstake(farm.publicKey, farmerIdentity);

    //withdrawal fails, since cooldown period not passed
    await expect(prepWithdrawal(gemAmount)).to.be.rejectedWith('0x140');

    await pause(6000);

    //run again to unlock vault
    await gf.unstake(farm.publicKey, farmerIdentity);

    //this time works
    await prepWithdrawal(gemAmount);

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
    assert(farmAcc.gemsStaked.eq(new BN(0)));

    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert.isFalse(vaultAcc.locked);

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));
  });
});
