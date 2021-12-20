import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { farmConfig, GemFarmTester } from './gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { pause } from '../utils/types';
import { VariableRateConfig } from './gem-farm.client';

chai.use(chaiAsPromised);

describe('the boring stuff', () => {
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

    assert(
      // @ts-ignore
      farmerAcc[gf.reward].paidOutReward.eq(farmerAcc[gf.reward].accruedReward)
    );

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

  // // --------------------------------------- flash deposit
  //
  // it('flash deposits a gems', async () => {
  //   //need at least 1 gem to lock the vault
  //   const initialDeposit = new BN(1);
  //
  //   await gf.callDeposit(initialDeposit, gf.farmer1Identity);
  //
  //   //stake
  //   const { farmer, vault } = await gf.stake(gf.farm.publicKey, gf.farmer1Identity);
  //
  //   let vaultAcc = await gf.fetchVaultAcc(vault);
  //   const oldGemsInVault = vaultAcc.gemCount;
  //   assert.isTrue(vaultAcc.locked);
  //
  //   let farmAcc = await gf.fetchFarmAcc(gf.farm.publicKey);
  //   const oldFarmerCount = farmAcc.stakedFarmerCount;
  //   const oldGemsStaked = farmAcc.gemsStaked;
  //
  //   let farmerAcc = await gf.fetchFarmerAcc(farmer);
  //   const oldBeginTs = farmerAcc.beginStakingTs;
  //   const oldEndTs = farmerAcc.minStakingEndsTs;
  //   assert(farmerAcc.gemsStaked.eq(oldGemsInVault));
  //
  //   //flash deposit after vault locked
  //   const flashDeposit = new BN(1);
  //
  //   await gf.callFlashDeposit(flashDeposit);
  //   // await printStructs('FLASH DEPOSITS');
  //
  //   vaultAcc = await gf.fetchVaultAcc(vault);
  //   assert(vaultAcc.gemCount.eq(oldGemsInVault.add(flashDeposit)));
  //   assert.isTrue(vaultAcc.locked);
  //
  //   farmAcc = await gf.fetchFarmAcc(gf.farm.publicKey);
  //   assert(farmAcc.stakedFarmerCount.eq(oldFarmerCount));
  //   assert(farmAcc.gemsStaked.eq(oldGemsStaked.add(flashDeposit)));
  //
  //   farmerAcc = await gf.fetchFarmerAcc(farmer);
  //   assert(farmerAcc.gemsStaked.eq(oldGemsInVault.add(flashDeposit)));
  //   //flash deposits resets staking time
  //   assert(farmerAcc.beginStakingTs.gte(oldBeginTs));
  //   assert(farmerAcc.minStakingEndsTs.gte(oldEndTs));
  // });
  //
  // // --------------------------------------- treasury payout
  //
  // async function prepTreasuryPayout(destination: PublicKey) {
  //   return gf.payoutFromTreasury(
  //     gf.farm.publicKey,
  //     gf.farmManager,
  //     destination,
  //     new BN(LAMPORTS_PER_SOL)
  //   );
  // }
  //
  // it('pays out from treasury', async () => {
  //   const destination = await gf.createWallet(0);
  //
  //   await prepTreasuryPayout(destination.publicKey);
  //
  //   const balance = await gf.getBalance(destination.publicKey);
  //   assert.equal(balance, LAMPORTS_PER_SOL);
  // });
});
