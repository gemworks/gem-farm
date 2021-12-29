import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { Numerical, stringifyPKsAndBNs, toBN } from '../gem-common/types';
import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import {
  FarmConfig,
  FixedRateConfig,
  GemFarmClient,
  RewardType,
  VariableRateConfig,
} from './gem-farm.client';
import { Token } from '@solana/spl-token';
import { ITokenData } from '../gem-common/account';
import { assert } from 'chai';
import { WhitelistType } from '../gem-bank/gem-bank.client';

// --------------------------------------- configs

export const PRECISION = 10 ** 15;

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
  funder = this.wallet.payer;

  //gem 1 used by farmer 1 / gem 2 by farmer 2
  gem1Amount!: anchor.BN;
  gem1!: ITokenData;
  gem2Amount!: anchor.BN;
  gem2!: ITokenData;

  constructor() {
    super(
      anchor.Provider.env().connection,
      anchor.Provider.env().wallet as anchor.Wallet
    );
  }

  async prepAccounts(initialFundingAmount: Numerical, reward?: string) {
    reward = Math.random() < 0.5 ? 'rewardA' : 'rewardB';
    console.log('running tests for', reward);

    this.bank = Keypair.generate();
    this.farm = Keypair.generate();
    this.farmManager = await this.createFundedWallet(100 * LAMPORTS_PER_SOL);

    this.farmer1Identity = await this.createFundedWallet(
      100 * LAMPORTS_PER_SOL
    );
    [this.farmer1Vault] = await this.findVaultPDA(
      this.bank.publicKey,
      this.farmer1Identity.publicKey
    );
    this.farmer2Identity = await this.createFundedWallet(
      100 * LAMPORTS_PER_SOL
    );
    [this.farmer2Vault] = await this.findVaultPDA(
      this.bank.publicKey,
      this.farmer2Identity.publicKey
    );

    if (reward) this.reward = reward;
    this.rewardMint = await this.createMint(0);
    this.rewardSource = await this.createAndFundATA(
      this.rewardMint,
      this.funder.publicKey,
      toBN(initialFundingAmount)
    );
    this.rewardSecondMint = await this.createMint(0);

    ({ gemAmount: this.gem1Amount, gem: this.gem1 } = await this.prepGem(
      this.farmer1Identity
    ));
    ({ gemAmount: this.gem2Amount, gem: this.gem2 } = await this.prepGem(
      this.farmer2Identity
    ));
  }

  async prepGem(owner?: Keypair) {
    const gemAmount = new BN(1 + Math.ceil(Math.random() * 100)); //min 2
    const gemOwner =
      owner ?? (await this.createFundedWallet(100 * LAMPORTS_PER_SOL));
    const gem = await this.createMintAndFundATA(gemOwner.publicKey, gemAmount);

    return { gemAmount, gemOwner, gem };
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

  async callInitFarm(farmConfig: FarmConfig, rewardType?: any) {
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
      farmConfig
    );
  }

  async callUpdateFarm(farmConfig?: FarmConfig, newManager?: PublicKey) {
    return this.updateFarm(
      this.farm.publicKey,
      this.farmManager,
      farmConfig,
      newManager
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
    accruedRewardPerGem?: Numerical
  ) {
    let farmAcc = (await this.fetchFarm()) as any;
    let reward = farmAcc[this.reward].variableRate;

    if (rewardRate || rewardRate === 0) {
      assert(reward.rewardRate.n.div(toBN(PRECISION)).eq(toBN(rewardRate)));
    }
    if (lastUpdated || lastUpdated === 0) {
      assert(reward.rewardLastUpdatedTs.eq(toBN(lastUpdated)));
    }
    if (accruedRewardPerGem || accruedRewardPerGem === 0) {
      assert(
        reward.accruedRewardPerGem.n
          .div(toBN(PRECISION))
          .eq(toBN(accruedRewardPerGem))
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

  async verifyStakedGemsAndFarmers(gems: Numerical, farmers: Numerical) {
    let farmAcc = await this.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(toBN(farmers)));
    assert(farmAcc.gemsStaked.eq(toBN(gems)));

    return farmAcc;
  }

  async verifyFarmerReward(
    identity: Keypair,
    paidOutReward?: Numerical,
    accruedReward?: Numerical,
    lastRecordedAccruedRewardPerGem?: Numerical,
    beginStakingTs?: Numerical,
    beginScheduleTs?: Numerical,
    lastUpdatedTs?: Numerical,
    promisedDuration?: Numerical
  ) {
    const [farmer] = await this.findFarmerPDA(
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
      lastRecordedAccruedRewardPerGem ||
      lastRecordedAccruedRewardPerGem === 0
    ) {
      assert(
        reward.variableRate.lastRecordedAccruedRewardPerGem.n
          .div(toBN(PRECISION))
          .eq(toBN(lastRecordedAccruedRewardPerGem))
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

    //verify farmer 1
    const farmer1Ratio =
      this.gem1Amount.toNumber() /
      (this.gem1Amount.toNumber() + this.gem2Amount.toNumber());

    console.log('farmer 1 ratio:', farmer1Ratio.toString());
    console.log(
      'accrued for farmer 1 and 2:',
      farmer1Accrued.toString(),
      farmer2Accrued.toString()
    );
    console.log(
      'accrued total for the farm:',
      stringifyPKsAndBNs(await this.verifyFunds())
    );

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

  async verifyAccruedRewardsFixed(perGem: Numerical) {
    //farmer 1
    const farmer1Reward = await this.verifyFarmerReward(this.farmer1Identity);
    assert(farmer1Reward.accruedReward.eq(this.gem1Amount.mul(toBN(perGem))));

    //farmer 2
    const farmer2Reward = await this.verifyFarmerReward(this.farmer2Identity);
    assert(farmer2Reward.accruedReward.eq(this.gem2Amount.mul(toBN(perGem))));

    const funds = await this.verifyFunds();
    assert(
      funds.totalAccruedToStakers.gte(
        toBN(perGem).mul(this.gem1Amount.add(this.gem2Amount))
      )
    );

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

    return farmerAcc;
  }

  async unstakeOnceAndVerify(identity: Keypair) {
    const { farmer, vault } = await this.callUnstake(identity);

    const vaultAcc = await this.fetchVaultAcc(vault);
    assert.isTrue(vaultAcc.locked);

    const farmerAcc = await this.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));

    return farmerAcc;
  }

  async unstakeTwiceAndVerify(identity: Keypair) {
    const { farmer, vault } = await this.callUnstake(identity);

    const vaultAcc = await this.fetchVaultAcc(vault);
    assert.isFalse(vaultAcc.locked);

    const farmerAcc = await this.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(new BN(0)));

    return farmerAcc;
  }

  // --------------------------------------- extras

  async printStructs(state?: string) {
    const farmAcc = await this.fetchFarmAcc(this.farm.publicKey);
    console.log(`// --------------------------------------- ${state}`);
    console.log('// --------------------------------------- farm');
    console.log(stringifyPKsAndBNs(farmAcc));

    const [farmer1] = await this.findFarmerPDA(
      this.farm.publicKey,
      this.farmer1Identity.publicKey
    );
    const farmer1Acc = await this.fetchFarmerAcc(farmer1);
    console.log('// --------------------------------------- farmer 1');
    console.log(stringifyPKsAndBNs(farmer1Acc));

    const [farmer2] = await this.findFarmerPDA(
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
