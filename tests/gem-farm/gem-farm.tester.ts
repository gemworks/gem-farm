import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  FarmConfig,
  findFarmerPDA,
  findVaultPDA,
  FixedRateConfig,
  GemFarmClient,
  ITokenData,
  MaxCounts,
  NodeWallet,
  Numerical,
  RarityConfig,
  RewardType,
  stringifyPKsAndBNs,
  toBN,
  VariableRateConfig,
  WhitelistType,
} from '../../src';
import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { Token } from '@solana/spl-token';
import { assert } from 'chai';

// --------------------------------------- configs

export const PRECISION = 10 ** 3;

export const defaultFarmConfig = <FarmConfig>{
  minStakingPeriodSec: new BN(0),
  cooldownPeriodSec: new BN(0),
  unstakingFeeLamp: new BN(LAMPORTS_PER_SOL),
};

export const defaultVariableConfig = <VariableRateConfig>{
  amount: new BN(10000), //10k
  durationSec: new BN(100), //at rate 100/s
};

export const defaultFixedConfig = <FixedRateConfig>{
  schedule: {
    //total 30 per gem
    baseRate: toBN(3),
    tier1: {
      rewardRate: toBN(5),
      requiredTenure: toBN(2),
    },
    tier2: {
      rewardRate: toBN(7),
      requiredTenure: toBN(4),
    },
    //leaving this one at 0 so that it's easy to test how much accrued over first 6s
    tier3: {
      rewardRate: toBN(0),
      requiredTenure: toBN(6),
    },
    denominator: toBN(1),
  },
  amount: new BN(30000), //fund 1000 gems
  durationSec: new BN(100),
};

// --------------------------------------- tester class

export class GemFarmTester extends GemFarmClient {
  //useful for quickly creating mint/token accounts
  nw: NodeWallet;

  //farm + bank
  bank!: Keypair;
  farm!: Keypair;
  farmManager!: Keypair;

  //farmer 1 + vault
  farmer1Identity!: Keypair;
  farmer1Vault!: PublicKey;
  farmer2Identity!: Keypair;
  farmer2Vault!: PublicKey;

  //rewards + funder
  reward = 'rewardA';
  rewardMint!: Token;
  rewardSource!: PublicKey;
  rewardSecondMint!: Token;
  funder: Keypair;

  //gem 1 used by farmer 1 / gem 2 by farmer 2
  gem1Amount!: anchor.BN;
  gem1!: ITokenData;
  gem1PerGemRarity!: number;
  gem2Amount!: anchor.BN;
  gem2!: ITokenData;
  gem2PerGemRarity!: number;

  constructor() {
    super(
      anchor.Provider.env().connection,
      // @ts-ignore
      anchor.Provider.env().wallet as anchor.Wallet
    );
    this.nw = new NodeWallet(
      anchor.Provider.env().connection,
      // @ts-ignore
      anchor.Provider.env().wallet as anchor.Wallet
    );
    this.funder = this.nw.wallet.payer;
  }

  async prepAccounts(
    initialFundingAmount: Numerical,
    gem1PerGemRarity: number = 1,
    gem2PerGemRarity: number = 1,
    reward?: string
  ) {
    reward = Math.random() < 0.5 ? 'rewardA' : 'rewardB';
    console.log('running tests for', reward);

    this.bank = Keypair.generate();
    this.farm = Keypair.generate();
    this.farmManager = await this.nw.createFundedWallet(100 * LAMPORTS_PER_SOL);

    this.farmer1Identity = await this.nw.createFundedWallet(
      100 * LAMPORTS_PER_SOL
    );
    [this.farmer1Vault] = await findVaultPDA(
      this.bank.publicKey,
      this.farmer1Identity.publicKey
    );
    this.farmer2Identity = await this.nw.createFundedWallet(
      100 * LAMPORTS_PER_SOL
    );
    [this.farmer2Vault] = await findVaultPDA(
      this.bank.publicKey,
      this.farmer2Identity.publicKey
    );

    if (reward) this.reward = reward;
    this.rewardMint = await this.nw.createMint(0);
    this.rewardSource = await this.nw.createAndFundATA(
      this.rewardMint,
      this.funder.publicKey,
      toBN(initialFundingAmount)
    );
    this.rewardSecondMint = await this.nw.createMint(0);

    //gem 1
    ({ gemAmount: this.gem1Amount, gem: this.gem1 } = await this.prepGem(
      this.farmer1Identity
    ));
    this.gem1PerGemRarity = gem1PerGemRarity;

    //gem 2
    ({ gemAmount: this.gem2Amount, gem: this.gem2 } = await this.prepGem(
      this.farmer2Identity
    ));
    this.gem2PerGemRarity = gem2PerGemRarity;
  }

  randomInt(min: number, max: number) {
    // min and max included
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  async prepGem(owner?: Keypair) {
    const gemAmount = new BN(100 + Math.ceil(Math.random() * 100)); //min 100
    const gemOwner =
      owner ?? (await this.nw.createFundedWallet(100 * LAMPORTS_PER_SOL));
    const gem = await this.nw.createMintAndFundATA(
      gemOwner.publicKey,
      gemAmount
    );

    return { gemAmount, gemOwner, gem };
  }

  async prepGemRarities() {
    if (this.gem1PerGemRarity > 1 || this.gem2PerGemRarity > 1) {
      await this.setGemRarities(this.gem1PerGemRarity, this.gem2PerGemRarity);
    }
  }

  // --------------------------------------- getters

  async fetchFarm() {
    return this.fetchFarmAcc(this.farm.publicKey);
  }

  async fetchTreasuryBal() {
    return this.fetchTreasuryBalance(this.farm.publicKey);
  }

  // --------------------------------------- callers
  // ----------------- core

  async callInitFarm(
    farmConfig: FarmConfig,
    rewardType?: any,
    maxCounts?: MaxCounts
  ) {
    const isRewardA = this.reward === 'rewardA';

    return this.initFarm(
      this.farm,
      this.farmManager,
      this.farmManager,
      this.bank,
      isRewardA ? this.rewardMint.publicKey : this.rewardSecondMint.publicKey,
      rewardType ?? RewardType.Variable,
      isRewardA ? this.rewardSecondMint.publicKey : this.rewardMint.publicKey,
      rewardType ?? RewardType.Variable,
      farmConfig,
      maxCounts
    );
  }

  async callUpdateFarm(
    farmConfig?: FarmConfig,
    newManager?: PublicKey,
    maxCounts?: MaxCounts
  ) {
    return this.updateFarm(
      this.farm.publicKey,
      this.farmManager,
      farmConfig,
      newManager,
      maxCounts
    );
  }

  async callPayout(destination: PublicKey, lamports: Numerical) {
    return this.payoutFromTreasury(
      this.farm.publicKey,
      this.farmManager,
      destination,
      toBN(lamports)
    );
  }

  async callAddToBankWhitelist(
    addressToWhitelist: PublicKey,
    whitelistType: WhitelistType
  ) {
    return this.addToBankWhitelist(
      this.farm.publicKey,
      this.farmManager,
      addressToWhitelist,
      whitelistType
    );
  }

  async callRemoveFromBankWhitelist(addressToRemove: PublicKey) {
    return this.removeFromBankWhitelist(
      this.farm.publicKey,
      this.farmManager,
      addressToRemove
    );
  }

  // ----------------- farmer

  async callInitFarmer(identity: Keypair) {
    return this.initFarmer(this.farm.publicKey, identity, identity);
  }

  async callStake(identity: Keypair) {
    return this.stake(this.farm.publicKey, identity);
  }

  async callUnstake(identity: Keypair) {
    return this.unstake(this.farm.publicKey, identity);
  }

  async callDeposit(gems: Numerical, identity: Keypair) {
    const isFarmer1 =
      identity.publicKey.toBase58() ===
      this.farmer1Identity.publicKey.toBase58();

    return this.depositGem(
      this.bank.publicKey,
      isFarmer1 ? this.farmer1Vault : this.farmer2Vault,
      identity,
      toBN(gems),
      isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint,
      isFarmer1 ? this.gem1.tokenAcc : this.gem2.tokenAcc
    );
  }

  async callWithdraw(gems: Numerical, identity: Keypair) {
    const isFarmer1 =
      identity.publicKey.toBase58() ===
      this.farmer1Identity.publicKey.toBase58();

    return this.withdrawGem(
      this.bank.publicKey,
      isFarmer1 ? this.farmer1Vault : this.farmer2Vault,
      identity,
      toBN(gems),
      isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint,
      identity.publicKey
    );
  }

  async callClaimRewards(identity: Keypair) {
    const isRewardA = this.reward === 'rewardA';

    return this.claim(
      this.farm.publicKey,
      identity,
      isRewardA ? this.rewardMint.publicKey : this.rewardSecondMint.publicKey,
      isRewardA ? this.rewardSecondMint.publicKey : this.rewardMint.publicKey
    );
  }

  async callFlashDeposit(
    gems: Numerical,
    identity: Keypair,
    mintProof?: PublicKey,
    metadata?: PublicKey,
    creatorProof?: PublicKey
  ) {
    const isFarmer1 =
      identity.publicKey.toBase58() ===
      this.farmer1Identity.publicKey.toBase58();

    return this.flashDeposit(
      this.farm.publicKey,
      identity,
      toBN(gems),
      isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint,
      isFarmer1 ? this.gem1.tokenAcc : this.gem2.tokenAcc,
      mintProof,
      metadata,
      creatorProof
    );
  }

  async callRefreshFarmer(identity: Keypair | PublicKey, reenroll?: boolean) {
    return this.refreshFarmer(this.farm.publicKey, identity, reenroll);
  }

  // ----------------- funder

  async callAuthorize() {
    return this.authorizeFunder(
      this.farm.publicKey,
      this.farmManager,
      this.funder.publicKey
    );
  }

  async callDeauthorize() {
    return this.deauthorizeFunder(
      this.farm.publicKey,
      this.farmManager,
      this.funder.publicKey
    );
  }

  // ----------------- rewards

  async callFundReward(
    varConfig?: VariableRateConfig,
    fixedConfig?: FixedRateConfig
  ) {
    return this.fundReward(
      this.farm.publicKey,
      this.rewardMint.publicKey,
      this.funder,
      this.rewardSource,
      varConfig,
      fixedConfig
    );
  }

  async callCancelReward() {
    return this.cancelReward(
      this.farm.publicKey,
      this.farmManager,
      this.rewardMint.publicKey,
      this.funder.publicKey
    );
  }

  async callLockReward() {
    return this.lockReward(
      this.farm.publicKey,
      this.farmManager,
      this.rewardMint.publicKey
    );
  }

  // --------------------------------------- rarities

  async callAddRaritiesToBank(rarityConfigs: RarityConfig[]) {
    return this.addRaritiesToBank(
      this.farm.publicKey,
      this.farmManager,
      rarityConfigs
    );
  }

  async setGemRarities(
    gem1PerGemRarity: number = 1,
    gem2PerGemRarity: number = 1
  ) {
    const configs: RarityConfig[] = [
      {
        mint: this.gem1.tokenMint,
        rarityPoints: gem1PerGemRarity,
      },
      {
        mint: this.gem2.tokenMint,
        rarityPoints: gem2PerGemRarity,
      },
    ];
    await this.callAddRaritiesToBank(configs);
  }

  // --------------------------------------- verifiers

  // ----------------- funding

  async verifyFunds(
    funded?: Numerical,
    refunded?: Numerical,
    accrued?: Numerical
  ) {
    let farmAcc = (await this.fetchFarm()) as any;
    let funds = farmAcc[this.reward].funds;

    if (funded || funded === 0) {
      assert(funds.totalFunded.eq(toBN(funded)));
    }
    if (refunded || refunded === 0) {
      assert(funds.totalRefunded.eq(toBN(refunded)));
    }
    if (accrued || accrued === 0) {
      assert(funds.totalAccruedToStakers.eq(toBN(accrued)));
    }

    return funds;
  }

  async verifyTimes(
    duration?: Numerical,
    rewardEnd?: Numerical,
    lockEnd?: Numerical
  ) {
    let farmAcc = (await this.fetchFarm()) as any;
    let times = farmAcc[this.reward].times;

    if (duration || duration === 0) {
      assert(times.durationSec.eq(toBN(duration)));
    }
    if (rewardEnd || rewardEnd === 0) {
      assert(times.rewardEndTs.eq(toBN(rewardEnd)));
    }
    if (lockEnd || lockEnd === 0) {
      assert(times.lockEndTs.eq(toBN(lockEnd)));
    }

    return times;
  }

  async verifyVariableReward(
    rewardRate?: Numerical,
    lastUpdated?: Numerical,
    accruedRewardPerRarityPoint?: Numerical
  ) {
    let farmAcc = (await this.fetchFarm()) as any;
    let reward = farmAcc[this.reward].variableRate;

    if (rewardRate || rewardRate === 0) {
      assert(reward.rewardRate.n.div(toBN(PRECISION)).eq(toBN(rewardRate)));
    }
    if (lastUpdated || lastUpdated === 0) {
      assert(reward.rewardLastUpdatedTs.eq(toBN(lastUpdated)));
    }
    if (accruedRewardPerRarityPoint || accruedRewardPerRarityPoint === 0) {
      assert(
        reward.accruedRewardPerRarityPoint.n
          .div(toBN(PRECISION))
          .eq(toBN(accruedRewardPerRarityPoint))
      );
    }

    return reward;
  }

  async verifyFixedReward(reservedAmount?: Numerical) {
    let farmAcc = (await this.fetchFarm()) as any;
    let reward = farmAcc[this.reward].fixedRate;

    // console.log('reserved is', reward.reservedAmount.toNumber());
    // console.log('expected is', toBN(reservedAmount).toNumber());

    if (reservedAmount || reservedAmount === 0) {
      assert(reward.reservedAmount.eq(toBN(reservedAmount)));
    }

    return reward;
  }

  async verifyPotContains(pot: PublicKey, amount: Numerical, sign?: string) {
    const rewardsPotAcc = await this.fetchTokenAcc(
      this.rewardMint.publicKey,
      pot
    );
    switch (sign) {
      case 'lt':
        assert(rewardsPotAcc.amount.lt(toBN(amount)));
        break;
      default:
        assert(rewardsPotAcc.amount.eq(toBN(amount)));
    }

    return rewardsPotAcc;
  }

  async verifyFunderAccContains(amount: Numerical, sign?: string) {
    const sourceAcc = await this.fetchTokenAcc(
      this.rewardMint.publicKey,
      this.rewardSource
    );
    switch (sign) {
      case 'gt':
        assert(sourceAcc.amount.gt(toBN(amount)));
        break;
      default:
        assert(sourceAcc.amount.eq(toBN(amount)));
    }

    return sourceAcc;
  }

  // ----------------- staking

  calcTotalGems(gem1Amount?: Numerical, gem2Amount?: Numerical) {
    return toBN(gem1Amount ?? this.gem1Amount).add(
      toBN(gem2Amount ?? this.gem2Amount)
    );
  }

  calcTotalGemRarity(gem1Amount?: Numerical, gem2Amount?: Numerical) {
    const gem1 = toBN(gem1Amount ?? this.gem1Amount).mul(
      toBN(this.gem1PerGemRarity)
    );
    const gem2 = toBN(gem2Amount ?? this.gem2Amount).mul(
      toBN(this.gem2PerGemRarity)
    );
    const total = gem1.add(gem2);

    // console.log(
    //   'rarities are: (gem1, gem2, total): ',
    //   gem1.toNumber(),
    //   gem2.toNumber(),
    //   total.toNumber()
    // );

    return { gem1, gem2, total };
  }

  async verifyStakedGemsAndFarmers(
    farmers: Numerical,
    gem1Amount?: Numerical,
    gem2Amount?: Numerical
  ) {
    let farmAcc = await this.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(toBN(farmers)));
    assert(farmAcc.gemsStaked.eq(this.calcTotalGems(gem1Amount, gem2Amount)));
    assert(
      farmAcc.rarityPointsStaked.eq(
        this.calcTotalGemRarity(gem1Amount, gem2Amount).total
      )
    );

    return farmAcc;
  }

  async verifyFarmerReward(
    identity: Keypair,
    paidOutReward?: Numerical,
    accruedReward?: Numerical,
    lastRecordedAccruedRewardPerRarityPoint?: Numerical,
    beginStakingTs?: Numerical,
    beginScheduleTs?: Numerical,
    lastUpdatedTs?: Numerical,
    promisedDuration?: Numerical
  ) {
    const [farmer] = await findFarmerPDA(
      this.farm.publicKey,
      identity.publicKey
    );
    const farmerAcc = (await this.fetchFarmerAcc(farmer)) as any;
    const reward = farmerAcc[this.reward];

    if (paidOutReward || paidOutReward === 0) {
      assert(reward.paidOutReward.eq(toBN(paidOutReward)));
    }
    if (accruedReward || accruedReward === 0) {
      assert(reward.accruedReward.eq(toBN(accruedReward)));
    }
    if (
      lastRecordedAccruedRewardPerRarityPoint ||
      lastRecordedAccruedRewardPerRarityPoint === 0
    ) {
      assert(
        reward.variableRate.lastRecordedAccruedRewardPerRarityPoint.n
          .div(toBN(PRECISION))
          .eq(toBN(lastRecordedAccruedRewardPerRarityPoint))
      );
    }
    if (beginStakingTs || beginStakingTs === 0) {
      assert(reward.fixedRate.beginStakingTs.eq(toBN(beginStakingTs)));
    }
    if (beginScheduleTs || beginScheduleTs === 0) {
      assert(reward.fixedRate.beginScheduleTs.eq(toBN(beginScheduleTs)));
    }
    if (lastUpdatedTs || lastUpdatedTs === 0) {
      assert(reward.fixedRate.lastUpdatedTs.eq(toBN(lastUpdatedTs)));
    }
    if (promisedDuration || promisedDuration === 0) {
      assert(reward.fixedRate.promisedDuration.eq(toBN(promisedDuration)));
    }

    return reward;
  }

  async verifyClaimedReward(identity: Keypair) {
    const rewardDest = await this.findATA(
      this.rewardMint.publicKey,
      identity.publicKey
    );
    const rewardDestAcc = await this.fetchTokenAcc(
      this.rewardMint.publicKey,
      rewardDest
    );

    //verify that
    //1)paid out = what's in the wallet
    //2)accrued = what's in the wallet
    await this.verifyFarmerReward(
      identity,
      rewardDestAcc.amount,
      rewardDestAcc.amount
    );

    return rewardDestAcc.amount;
  }

  // assumes that both farmers have been staked for the same length of time
  // tried also adding upper bound, but it breaks if f1/f2 ratio is tiny (makes tests non-deterministic)
  async verifyAccruedRewardsVariable(minExpectedFarmAccrued: number) {
    //fetch farmer 1
    const farmer1Reward = await this.verifyFarmerReward(this.farmer1Identity);
    const farmer1Accrued = farmer1Reward.accruedReward;

    //fetch farmer 2
    const farmer2Reward = await this.verifyFarmerReward(this.farmer2Identity);
    const farmer2Accrued = farmer2Reward.accruedReward;

    const { gem1: gem1Rarity, gem2: gem2Rarity } = this.calcTotalGemRarity();

    //verify farmer 1
    const farmer1Ratio =
      gem1Rarity.toNumber() / (gem1Rarity.toNumber() + gem2Rarity.toNumber());

    // console.log('farmer 1 ratio:', farmer1Ratio.toString());
    // console.log(
    //   'accrued for farmer 1 and 2:',
    //   farmer1Accrued.toString(),
    //   farmer2Accrued.toString()
    // );
    // console.log(
    //   'accrued total for the farm:',
    //   stringifyPKsAndBNs(await this.verifyFunds())
    // );

    assert(farmer1Accrued.gte(new BN(farmer1Ratio * minExpectedFarmAccrued)));

    //verify farmer 2
    const farmer2Ratio = 1 - farmer1Ratio;
    assert(farmer2Accrued.gte(new BN(farmer2Ratio * minExpectedFarmAccrued)));

    // ideally would love to do farmer1accrued + farmer2accrued,
    // but that only works when both farmers unstake, and stop accruing
    // (that's coz we update them sequentially, one by one)
    const funds = await this.verifyFunds(10000, 0);
    assert(funds.totalAccruedToStakers.gte(toBN(minExpectedFarmAccrued)));

    return [farmer1Reward, farmer2Reward];
  }

  async verifyAccruedRewardsFixed(perRarityPoint: Numerical) {
    const {
      gem1: gem1Rarity,
      gem2: gem2Rarity,
      total,
    } = this.calcTotalGemRarity();

    //farmer 1
    const farmer1Reward = await this.verifyFarmerReward(this.farmer1Identity);
    assert(
      farmer1Reward.accruedReward.eq(gem1Rarity.mul(toBN(perRarityPoint)))
    );

    //farmer 2
    const farmer2Reward = await this.verifyFarmerReward(this.farmer2Identity);
    assert(
      farmer2Reward.accruedReward.eq(gem2Rarity.mul(toBN(perRarityPoint)))
    );

    const funds = await this.verifyFunds();
    assert(funds.totalAccruedToStakers.gte(toBN(perRarityPoint).mul(total)));

    return [farmer1Reward, farmer2Reward];
  }

  async verifyFarmerFixedRewardTimings(identity: Keypair, atStaking: boolean) {
    let fixed = (await this.verifyFarmerReward(identity)).fixedRate;
    const tenSecAgo = +new Date() / 1000 - 10;

    //all TS within 10 sec
    assert(fixed.beginStakingTs.gt(toBN(tenSecAgo)));
    assert(fixed.beginScheduleTs.gt(toBN(tenSecAgo)));

    //it will be equal if ran right after staking, it will be above if ran later
    if (atStaking) {
      assert(fixed.lastUpdatedTs.eq(fixed.beginStakingTs));
    } else {
      assert(fixed.lastUpdatedTs.gt(fixed.beginStakingTs));
    }

    //staking TS = schedule TS
    assert(fixed.beginStakingTs.eq(fixed.beginScheduleTs));

    //duration close to 100
    assert(fixed.promisedDuration.gt(toBN(90)));
    assert(fixed.promisedDuration.lte(toBN(100)));
  }

  async stakeAndVerify(identity: Keypair) {
    const { farmer } = await this.callStake(identity);

    let vaultAcc = await this.fetchVaultAcc(
      identity === this.farmer1Identity ? this.farmer1Vault : this.farmer2Vault
    );
    assert.isTrue(vaultAcc.locked);

    let farmerAcc = await this.fetchFarmerAcc(farmer);
    assert(
      farmerAcc.gemsStaked.eq(
        identity === this.farmer1Identity ? this.gem1Amount : this.gem2Amount
      )
    );

    const { gem1: gem1Rarity, gem2: gem2Rarity } = this.calcTotalGemRarity();
    assert(
      farmerAcc.rarityPointsStaked.eq(
        identity === this.farmer1Identity ? gem1Rarity : gem2Rarity
      )
    );

    return farmerAcc;
  }

  async unstakeOnceAndVerify(identity: Keypair) {
    const { farmer, vault } = await this.callUnstake(identity);

    const vaultAcc = await this.fetchVaultAcc(vault);
    assert.isTrue(vaultAcc.locked);

    const farmerAcc = await this.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));
    assert(farmerAcc.rarityPointsStaked.eq(new BN(0)));

    return farmerAcc;
  }

  async unstakeTwiceAndVerify(identity: Keypair) {
    const { farmer, vault } = await this.callUnstake(identity);

    const vaultAcc = await this.fetchVaultAcc(vault);
    assert.isFalse(vaultAcc.locked);

    const farmerAcc = await this.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));
    assert(farmerAcc.rarityPointsStaked.eq(new BN(0)));

    return farmerAcc;
  }

  // --------------------------------------- extras

  async printStructs(state?: string) {
    const farmAcc = await this.fetchFarmAcc(this.farm.publicKey);
    console.log(`// --------------------------------------- ${state}`);
    console.log('// --------------------------------------- farm');
    console.log(stringifyPKsAndBNs(farmAcc));

    const [farmer1] = await findFarmerPDA(
      this.farm.publicKey,
      this.farmer1Identity.publicKey
    );
    const farmer1Acc = await this.fetchFarmerAcc(farmer1);
    console.log('// --------------------------------------- farmer 1');
    console.log(stringifyPKsAndBNs(farmer1Acc));

    const [farmer2] = await findFarmerPDA(
      this.farm.publicKey,
      this.farmer2Identity.publicKey
    );
    try {
      const farmer2Acc = await this.fetchFarmerAcc(farmer2);
      console.log('// --------------------------------------- farmer 2');
      console.log(stringifyPKsAndBNs(farmer2Acc));
    } catch (e) {}
  }

  async mintMoreRewards(amount: number) {
    await this.rewardMint.mintTo(this.rewardSource, this.funder, [], amount);
  }
}
