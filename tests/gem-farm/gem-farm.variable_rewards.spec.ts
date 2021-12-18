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

// todo once happy with architecture do proper testing
describe('gem farm (0 min staking / cooldown)', () => {
  //farm + bank
  const bank = Keypair.generate();
  const farm = Keypair.generate();
  const farmConfig = <FarmConfig>{
    minStakingPeriodSec: new BN(0),
    cooldownPeriodSec: new BN(0),
    unstakingFeeLamp: new BN(LAMPORTS_PER_SOL),
  };
  let farmManager: Keypair;

  //farmer + vault
  let farmerIdentity: Keypair;
  let farmerVault: PublicKey;

  //rewards + funder
  let rewardAmount = new BN(110000);
  let rewardDurationSec = new BN(100);
  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;
  let funder = gf.wallet.payer;

  function printState() {}

  async function printStructs(state: string) {
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    console.log(`// --------------------------------------- ${state}`);
    console.log('// --------------------------------------- farm');
    console.log(stringifyPubkeysAndBNsInObject(farmAcc));

    const [farmer] = await gf.findFarmerPDA(
      farm.publicKey,
      farmerIdentity.publicKey
    );
    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    console.log('// --------------------------------------- farmer');
    console.log(stringifyPubkeysAndBNsInObject(farmerAcc));
  }

  // --------------------------------------- farm

  before('configures accounts', async () => {
    farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
    farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);

    rewardA = await gf.createToken(0, funder.publicKey);
    rewardASource = await gf.createAndFundATA(rewardA, funder, rewardAmount);
    rewardB = await gf.createToken(0, funder.publicKey);
    rewardBSource = await gf.createAndFundATA(rewardB, funder, rewardAmount);
  });

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

  it('inits farmer', async () => {
    const { vault, farmer } = await gf.initFarmer(
      farm.publicKey,
      farmerIdentity,
      farmerIdentity
    );
    farmerVault = vault;

    const farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert.equal(farmerAcc.farm.toBase58(), farm.publicKey.toBase58());
  });

  // --------------------------------------- funding

  async function prepAuthorization() {
    return gf.authorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  async function prepDeauthorization() {
    return gf.deauthorizeFunder(farm.publicKey, farmManager, funder.publicKey);
  }

  async function prepFunding() {
    return gf.fund(
      farm.publicKey,
      rewardA.publicKey,
      rewardASource,
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
    await expect(prepFunding()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );

    //second should fail (not idempotent)
    await expect(prepDeauthorization()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );
  });

  it('funds the farm', async () => {
    // need to authorize again
    await prepAuthorization();

    const { pot, fundingReceipt } = await prepFunding();
    await printStructs('FARM FUNDED');

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.rewardDurationSec.eq(rewardDurationSec));
    // @ts-ignore - reward end should not be 0
    assert(!farmAcc.rewardA.rewardEndTs.eq(new BN(0)));
    // @ts-ignore - but lock should, it's not set yet
    assert(farmAcc.rewardA.lockEndTs.eq(new BN(0)));
    assert(!farmAcc.rewardsLastUpdatedTs.eq(new BN(0)));
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.eq(new BN(1100)));
    assert(
      // @ts-ignore
      farmAcc.rewardA.variableRateTracker.accruedRewardPerGem.eq(new BN(0))
    );
    // @ts-ignore
    assert(farmAcc.rewardA.rewardDurationSec.eq(new BN(100)));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert.equal(frAcc.funder.toBase58(), funder.publicKey.toBase58());
    assert(frAcc.totalDepositedAmount.eq(rewardAmount));
    assert(frAcc.depositCount.eq(new BN(1)));
  });

  it('defunds the farm', async () => {
    //must be smaller than what's left unaccrued, or will not be able to withdraw
    const defundAmount = new BN(10000);

    const { pot, fundingReceipt } = await prepDefunding(defundAmount);
    await printStructs('FARM DEFUNDED');

    //new RR = new reward / previous duration. Due to how calcs are done can be off by a bit
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.gt(new BN(990)));
    // @ts-ignore
    assert(farmAcc.rewardA.variableRateTracker.rewardRate.lt(new BN(1010)));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount.sub(defundAmount)));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert(frAcc.totalWithdrawnAmount.eq(defundAmount));
    assert(frAcc.withdrawalCount.eq(new BN(1)));
  });

  it('locks rewards in place', async () => {
    await gf.lockFunding(farm.publicKey, farmManager, rewardA.publicKey);
    await printStructs('REWARDS LOCKED');

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore - lock should now be set equal to duration
    assert(farmAcc.rewardA.lockEndTs.eq(farmAcc.rewardA.rewardEndTs));

    //once locked, no more funding or defunding is possible
    await expect(prepFunding()).to.be.rejectedWith('0x155');
    await expect(prepDefunding(new BN(100))).to.be.rejectedWith('0x155');
  });

  // --------------------------------------- gem ops: deposit, stake & claim

  describe('gem operations', () => {
    let gemAmount: anchor.BN;
    let gem: ITokenData;

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

    async function prepFlashDeposit(gemAmount: BN) {
      return gf.flashDeposit(
        farm.publicKey,
        farmerIdentity,
        gemAmount,
        gem.tokenMint,
        gem.tokenAcc
      );
    }

    async function prepRefreshFarmer() {
      return gf.refreshFarmer(farm.publicKey, farmerIdentity);
    }

    async function assertRewardMatches(gems: BN) {
      const [farmer] = await gf.findFarmerPDA(
        farm.publicKey,
        farmerIdentity.publicKey
      );
      const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      const farmerAcc = await gf.fetchFarmerAcc(farmer);
      const rewardPerGem =
        // @ts-ignore
        farmAcc.rewardA.variableRateTracker.accruedRewardPerGem;

      assert(
        // @ts-ignore
        farmerAcc.rewardA.accruedReward.eq(rewardPerGem.mul(gems))
      );
    }

    beforeEach('creates a fresh gem', async () => {
      ({ gemAmount, gem } = await prepGem(gf, farmerIdentity));
    });

    it('stakes / unstakes gems', async () => {
      //deposit some gems into the vault
      await prepDeposit(gemAmount);

      // ----------------- stake
      const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);

      let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
      assert(farmAcc.gemsStaked.eq(gemAmount));
      assert(
        // @ts-ignore - when just staked there shouldn't be any accrued rewards yet
        farmAcc.rewardA.variableRateTracker.accruedRewardPerGem.eq(new BN(0))
      );
      let gemsStakedBeforeUnstaking = farmAcc.gemsStaked.clone();

      let vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);

      let farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(gemAmount));

      let treasuryBalance = await gf.fetchTreasuryBalance(farm.publicKey);
      assert.equal(treasuryBalance, 0);

      // ----------------- wait to accrue some rewards
      await pause(2000);

      await prepRefreshFarmer();
      await printStructs('STAKED');

      await assertRewardMatches(gemsStakedBeforeUnstaking);

      // ----------------- unstake once to move into cooldown
      await gf.unstake(farm.publicKey, farmerIdentity);

      vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isTrue(vaultAcc.locked);

      //todo if done after 2nd unstaking, this non-deterministically fails - why?
      await assertRewardMatches(gemsStakedBeforeUnstaking);

      // ----------------- unstake second time to actually open up the vault for withdrawing
      await gf.unstake(farm.publicKey, farmerIdentity);
      await printStructs('UNSTAKED');

      farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
      assert(farmAcc.gemsStaked.eq(new BN(0)));

      vaultAcc = await gf.fetchVaultAcc(vault);
      assert.isFalse(vaultAcc.locked);

      farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(new BN(0)));

      treasuryBalance = await gf.fetchTreasuryBalance(farm.publicKey);
      assert.equal(treasuryBalance, LAMPORTS_PER_SOL);
    });

    it('claims rewards', async () => {
      const { rewardADestination, farmer } = await gf.claim(
        farm.publicKey,
        farmerIdentity,
        rewardA.publicKey,
        rewardB.publicKey
      );
      await printStructs('CLAIMED');

      const rewardADestAcc = await gf.fetchRewardAcc(
        rewardA.publicKey,
        rewardADestination
      );

      const farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(
        // @ts-ignore
        farmerAcc.rewardA.paidOutReward.eq(farmerAcc.rewardA.accruedReward)
      );

      // @ts-ignore
      assert(rewardADestAcc.amount.eq(farmerAcc.rewardA.paidOutReward));
    });

    it('flash deposits a gems', async () => {
      //need at least 1 gem to lock the vault
      const initialDeposit = new BN(1);

      await prepDeposit(initialDeposit);

      //stake
      const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);

      let vaultAcc = await gf.fetchVaultAcc(vault);
      let oldGemsInVault = vaultAcc.gemCount;
      assert.isTrue(vaultAcc.locked);

      let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      let oldFarmerCount = farmAcc.stakedFarmerCount;
      let oldGemsStaked = farmAcc.gemsStaked;

      let farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(oldGemsInVault));

      //flash deposit after vault locked
      const flashDeposit = new BN(1);

      await prepFlashDeposit(flashDeposit);
      await printStructs('FLASH DEPOSITS');

      vaultAcc = await gf.fetchVaultAcc(vault);
      assert(vaultAcc.gemCount.eq(oldGemsInVault.add(flashDeposit)));
      assert.isTrue(vaultAcc.locked);

      farmAcc = await gf.fetchFarmAcc(farm.publicKey);
      assert(farmAcc.stakedFarmerCount.eq(oldFarmerCount));
      assert(farmAcc.gemsStaked.eq(oldGemsStaked.add(flashDeposit)));

      farmerAcc = await gf.fetchFarmerAcc(farmer);
      assert(farmerAcc.gemsStaked.eq(oldGemsInVault.add(flashDeposit)));
    });
  });

  // --------------------------------------- misc

  // it('pays out from treasury', async () => {
  //   const destination = await gf.createWallet(0);
  //
  //   await gf.payoutFromTreasury(
  //     farm.publicKey,
  //     farmManager,
  //     destination.publicKey,
  //     new BN(LAMPORTS_PER_SOL)
  //   );
  //
  //   const balance = await gf.getBalance(destination.publicKey);
  //   assert.equal(balance, LAMPORTS_PER_SOL);
  // });
});

// describe('gem farm (w/ min staking / cooldown)', () => {
//   //farm + bank
//   const bank = Keypair.generate();
//   const farm = Keypair.generate();
//   const farmConfig = <FarmConfig>{
//     minStakingPeriodSec: new BN(5),
//     cooldownPeriodSec: new BN(5),
//     unstakingFeeLamp: new BN(0),
//   };
//   let farmManager: Keypair;
//
//   //farmer + vault
//   let farmerIdentity: Keypair;
//   let farmerVault: PublicKey;
//
//   //rewards + funder
//   let rewardA: Token;
//   let rewardB: Token;
//   let funder: Keypair;
//
//   //gems
//   let gemAmount: anchor.BN;
//   let gem: ITokenData;
//
//   before('configures accounts', async () => {
//     farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//     farmerIdentity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//     funder = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//
//     rewardA = await gf.createToken(0, funder.publicKey);
//     rewardB = await gf.createToken(0, funder.publicKey);
//
//     //farm
//     await gf.initFarm(
//       farm,
//       farmManager,
//       farmManager,
//       bank,
//       rewardA.publicKey,
//       RewardType.Variable,
//       rewardB.publicKey,
//       RewardType.Variable,
//       farmConfig
//     );
//
//     //farmer
//     const { vault } = await gf.initFarmer(
//       farm.publicKey,
//       farmerIdentity,
//       farmerIdentity
//     );
//     farmerVault = vault;
//
//     //gem
//     ({ gemAmount, gem } = await prepGem(gf, farmerIdentity));
//   });
//
//   async function prepDeposit(gemAmount: BN) {
//     return gf.depositGem(
//       bank.publicKey,
//       farmerVault,
//       farmerIdentity,
//       gemAmount,
//       gem.tokenMint,
//       gem.tokenAcc
//     );
//   }
//
//   async function prepWithdrawal(gemAmount: BN) {
//     return gf.withdrawGem(
//       bank.publicKey,
//       farmerVault,
//       farmerIdentity,
//       gemAmount,
//       gem.tokenMint,
//       farmerIdentity.publicKey
//     );
//   }
//
//   it('moves through farmer lifecycle (unstaked -> staked -> cooldown)', async () => {
//     //deposit some gems into the vault
//     await prepDeposit(gemAmount);
//
//     //stake
//     const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);
//
//     //unstaking fails, since min period not passed
//     await expect(gf.unstake(farm.publicKey, farmerIdentity)).to.be.rejectedWith(
//       '0x156'
//     );
//
//     await pause(6000);
//
//     //begin cooldown
//     await gf.unstake(farm.publicKey, farmerIdentity);
//
//     //withdrawal fails, since cooldown period not passed
//     await expect(prepWithdrawal(gemAmount)).to.be.rejectedWith('0x140');
//
//     await pause(6000);
//
//     //run again to unlock vault
//     await gf.unstake(farm.publicKey, farmerIdentity);
//
//     //this time works
//     await prepWithdrawal(gemAmount);
//
//     const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
//     assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
//     assert(farmAcc.gemsStaked.eq(new BN(0)));
//
//     const vaultAcc = await gf.fetchVaultAcc(vault);
//     assert.isFalse(vaultAcc.locked);
//
//     const farmerAcc = await gf.fetchFarmerAcc(farmer);
//     assert(farmerAcc.gemsStaked.eq(new BN(0)));
//   });
// });
