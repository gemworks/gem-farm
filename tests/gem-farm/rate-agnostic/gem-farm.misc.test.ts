import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { BN } from '@project-serum/anchor';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  FarmConfig,
  feeAccount,
  RewardType,
  WhitelistType,
} from '../../../src';

chai.use(chaiAsPromised);

const updatedFarmConfig = <FarmConfig>{
  minStakingPeriodSec: new BN(0),
  cooldownPeriodSec: new BN(0),
  unstakingFeeLamp: new BN(LAMPORTS_PER_SOL / 2),
};

const creator = new PublicKey('75ErM1QcGjHiPMX7oLsf9meQdGSUs4ZrwS2X8tBpsZhA');

describe('misc', () => {
  let gf = new GemFarmTester();

  before('preps accs', async () => {
    await gf.prepAccounts(45000);
  });

  it('inits the farm', async () => {
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);

    const farmAcc = (await gf.fetchFarm()) as any;
    assert.equal(farmAcc.bank.toBase58(), gf.bank.publicKey.toBase58());
    assert.equal(
      farmAcc[gf.reward].rewardMint.toBase58(),
      gf.rewardMint.publicKey.toBase58()
    );

    let bal = await gf.getBalance(feeAccount);
    assert(bal > 0); //can't check exact amount coz depends on order of tests
  });

  it('updates the farm', async () => {
    await gf.callUpdateFarm(updatedFarmConfig);

    const farmAcc = await gf.fetchFarm();
    assert.equal(
      farmAcc.config.unstakingFeeLamp.toNumber(),
      LAMPORTS_PER_SOL / 2
    );
  });

  it('fails to double init an existing farm', async () => {
    await expect(
      gf.callInitFarm(defaultFarmConfig, RewardType.Fixed)
    ).to.be.rejectedWith('0x0'); //account in use
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

  it('refreshes farmer (signed)', async () => {
    //as long as it succeeds - test's ok
    await gf.callRefreshFarmer(gf.farmer1Identity, false);
  });

  it('FAILS to refresh farmer (signed)', async () => {
    //w/o reenrolling we're calling the normal one
    await gf.callRefreshFarmer(gf.farmer1Identity.publicKey);
    //now we're calling the signed one, and this should fail
    await expect(
      gf.callRefreshFarmer(gf.farmer1Identity.publicKey, false)
    ).to.be.rejectedWith('Signature verification failed');
  });

  // --------------------------------------- whitelisting

  it('whitelists a creator', async () => {
    let { whitelistProof } = await gf.callAddToBankWhitelist(
      creator,
      WhitelistType.Creator
    );

    const proofAcc = await gf.fetchWhitelistProofAcc(whitelistProof);
    assert.equal(proofAcc.whitelistedAddress.toBase58(), creator.toBase58());
    assert.equal(proofAcc.whitelistType, WhitelistType.Creator);
  });

  it('removes a whitelisted creator', async () => {
    let { whitelistProof } = await gf.callRemoveFromBankWhitelist(creator);

    await expect(gf.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith(
      'Account does not exist'
    );
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
    await expect(
      gf.callFundReward(undefined, defaultFixedConfig)
    ).to.be.rejectedWith('3012');

    //second should fail (not idempotent)
    await expect(gf.callDeauthorize()).to.be.rejectedWith('3012');
  });

  // --------------------------------------- treasury payout

  it('pays out from treasury', async () => {
    // unstake to accrue payout fees that will go into treasury
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callStake(gf.farmer1Identity);
    await gf.callUnstake(gf.farmer1Identity);

    const destination = await gf.nw.createFundedWallet(0);

    await gf.callPayout(destination.publicKey, new BN(LAMPORTS_PER_SOL / 2));

    const balance = await gf.getBalance(destination.publicKey);
    assert.equal(balance, LAMPORTS_PER_SOL / 2);
  });
});
