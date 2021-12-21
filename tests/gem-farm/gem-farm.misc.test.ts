import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultVariableConfig,
  GemFarmTester,
} from './gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { pause } from '../utils/types';

chai.use(chaiAsPromised);

describe.skip('misc', () => {
  let gf = new GemFarmTester();

  before('preps accs', async () => {
    await gf.prepAccounts(new BN(10000));
  });

  it('inits the farm', async () => {
    await gf.callInitFarm(defaultFarmConfig);

    const farmAcc = (await gf.fetchFarm()) as any;
    assert.equal(farmAcc.bank.toBase58(), gf.bank.publicKey.toBase58());
    assert.equal(
      farmAcc[gf.reward].rewardMint.toBase58(),
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
    await expect(gf.callFundReward(defaultVariableConfig)).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );

    //second should fail (not idempotent)
    await expect(gf.callDeauthorize()).to.be.rejectedWith(
      'The given account is not owned by the executing program'
    );
  });

  // --------------------------------------- locking

  it('locks rewards in place', async () => {
    // get some funding in
    await gf.callAuthorize();
    await gf.callFundReward(defaultVariableConfig);

    //place the lock
    await gf.lockReward(
      gf.farm.publicKey,
      gf.farmManager,
      gf.rewardMint.publicKey
    );
    // await printStructs('LOCKED');

    //lock duration should now be == reward end duration
    const farmAcc = (await gf.fetchFarm()) as any;
    assert(
      farmAcc[gf.reward].times.lockEndTs.eq(
        farmAcc[gf.reward].times.rewardEndTs
      )
    );

    //once locked, funding/cancellation ixs should fail
    await expect(gf.callFundReward(defaultVariableConfig)).to.be.rejectedWith(
      '0x155'
    );
    await expect(gf.callCancelReward()).to.be.rejectedWith('0x155');
  });

  // --------------------------------------- flash deposit

  it('flash deposits a gems', async () => {
    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);

    //stake to lock the vault
    const { farmer, vault } = await gf.callStake(gf.farmer1Identity);

    let vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit));
    assert.isTrue(vaultAcc.locked);

    let farmAcc = await gf.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
    assert(farmAcc.gemsStaked.eq(initialDeposit));

    let farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(initialDeposit));
    const oldBeginTs = farmerAcc.beginStakingTs;
    const oldEndTs = farmerAcc.minStakingEndsTs;

    //wait for 1 sec so that flash deposit staking time is recorded as different
    await pause(1000);

    //flash deposit after vault locked
    const flashDeposit = new BN(1);

    await gf.callFlashDeposit(flashDeposit);
    // await printStructs('FLASH DEPOSITS');

    vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(flashDeposit)));
    assert.isTrue(vaultAcc.locked);

    farmAcc = await gf.fetchFarm();
    assert(farmAcc.stakedFarmerCount.eq(new BN(1)));
    assert(farmAcc.gemsStaked.eq(initialDeposit.add(flashDeposit)));

    farmerAcc = await gf.fetchFarmerAcc(farmer);
    assert(farmerAcc.gemsStaked.eq(initialDeposit.add(flashDeposit)));
    //flash deposits resets staking time, which means it should be higher
    assert(farmerAcc.beginStakingTs.gt(oldBeginTs));
    assert(farmerAcc.minStakingEndsTs.gt(oldEndTs));
  });

  // --------------------------------------- treasury payout

  it('pays out from treasury', async () => {
    // unstake to accrue payout fees that will go into treasury
    await gf.callUnstake(gf.farmer1Identity);

    const destination = await gf.createWallet(0);

    await gf.callPayout(destination.publicKey, new BN(LAMPORTS_PER_SOL));

    const balance = await gf.getBalance(destination.publicKey);
    assert.equal(balance, LAMPORTS_PER_SOL);
  });
});
