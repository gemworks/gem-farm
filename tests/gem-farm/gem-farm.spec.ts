import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { GemFarmClient, RewardType } from './gem-farm.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Token } from '@solana/spl-token';
import { stringifyPubkeysAndBNsInObject } from '../utils/types';

chai.use(chaiAsPromised);

//todo once happy with architecture do proper testing
describe('gem farm', () => {
  const _provider = anchor.Provider.env();
  const gf = new GemFarmClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state

  const bank = Keypair.generate();

  const farm = Keypair.generate();
  let farmManager: Keypair;
  let farmerIdentity: Keypair;

  let rewardAmount = new BN(10000);
  let rewardDurationSec = new BN(100);

  let rewardA: Token;
  let rewardASource: PublicKey;
  let rewardB: Token;
  let rewardBSource: PublicKey;

  let farmerVault: PublicKey;

  let funder = gf.wallet.payer;

  function printState() {}

  async function printStructs() {
    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    console.log(stringifyPubkeysAndBNsInObject(farmAcc));

    const [farmer] = await gf.findFarmerPDA(
      farm.publicKey,
      farmerIdentity.publicKey
    );
    const farmerAcc = await gf.fetchFarmerAcc(farmer);
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
      RewardType.Variable
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

  async function prepDefunding(amount: BN) {
    return gf.defund(farm.publicKey, rewardA.publicKey, funder, amount);
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

    const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
    // @ts-ignore
    assert(farmAcc.rewardA.rewardDurationSec.eq(rewardDurationSec));

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert.equal(frAcc.funder.toBase58(), funder.publicKey.toBase58());
    assert(frAcc.totalDepositedAmount.eq(rewardAmount));
    assert(frAcc.depositCount.eq(new BN(1)));

    // console.log('// --------------------------------------- FARM FUNDED');
    // await printStructs();
  });

  it('defunds the farm', async () => {
    const defundAmount = new BN(100);

    const { pot, fundingReceipt } = await prepDefunding(defundAmount);

    const rewardsPotAcc = await gf.fetchRewardAcc(rewardA.publicKey, pot);
    assert(rewardsPotAcc.amount.eq(rewardAmount.sub(defundAmount)));

    const frAcc = await gf.fetchFundingReceiptAcc(fundingReceipt);
    assert(frAcc.totalWithdrawnAmount.eq(defundAmount));
    assert(frAcc.withdrawalCount.eq(new BN(1)));

    // console.log('// --------------------------------------- FARM DEFUNDED');
    // await printStructs();
  });

  it('locks rewards in place', async () => {
    const defundAmount = new BN(100);

    await gf.lockFunding(farm.publicKey, farmManager, rewardA.publicKey);

    //once locked, no more funding or defunding is possible
    await expect(prepFunding()).to.be.rejectedWith('0x155');
    await expect(prepDefunding(defundAmount)).to.be.rejectedWith('0x155');
  });

  // --------------------------------------- stake & claim

  // describe('gem operations', () => {
  //   let gemAmount: anchor.BN;
  //   let gemOwner: Keypair;
  //   let gem: ITokenData;
  //
  //   async function prepDeposit() {
  //     await gf.depositGem(
  //       bank.publicKey,
  //       farmerVault,
  //       farmerIdentity,
  //       gemAmount,
  //       gem.tokenMint,
  //       gem.tokenAcc,
  //       farmerIdentity
  //     );
  //   }
  //
  //   beforeEach('creates a fresh gem', async () => {
  //     ({ gemAmount, gemOwner, gem } = await prepGem(gf, farmerIdentity));
  //   });
  //
  //   it('stakes / unstakes gems', async () => {
  //     //deposit some gems into the vault
  //     await prepDeposit();
  //
  //     //stake
  //     const { farmer, vault } = await gf.stake(farm.publicKey, farmerIdentity);
  //
  //     let farmAcc = await gf.fetchFarmAcc(farm.publicKey);
  //     assert(farmAcc.activeFarmerCount.eq(new BN(1)));
  //     assert(farmAcc.gemsStaked.eq(gemAmount));
  //
  //     let vaultAcc = await gf.fetchVaultAcc(vault);
  //     assert.isTrue(vaultAcc.locked);
  //
  //     let farmerAcc = await gf.fetchFarmerAcc(farmer);
  //     assert(farmerAcc.gemsStaked.eq(gemAmount));
  //
  //     console.log('// --------------------------------------- STAKED');
  //     await printStructs();
  //
  //     //wait for a couple seconds, to accrue some rewards
  //     await pause(2000);
  //
  //     //unstake
  //     await gf.unstake(farm.publicKey, farmerIdentity);
  //
  //     farmAcc = await gf.fetchFarmAcc(farm.publicKey);
  //     assert(farmAcc.activeFarmerCount.eq(new BN(0)));
  //     assert(farmAcc.gemsStaked.eq(new BN(0)));
  //
  //     vaultAcc = await gf.fetchVaultAcc(vault);
  //     assert.isFalse(vaultAcc.locked);
  //
  //     farmerAcc = await gf.fetchFarmerAcc(farmer);
  //     assert(farmerAcc.gemsStaked.eq(new BN(0)));
  //
  //     console.log('// --------------------------------------- UNSTAKED');
  //     await printStructs();
  //   });
  //
  //   it('claims rewards', async () => {
  //     const { rewardADestination } = await gf.claim(
  //       farm.publicKey,
  //       farmerIdentity,
  //       rewardA.publicKey,
  //       rewardB.publicKey
  //     );
  //
  //     const rewardADestAcc = await gf.fetchRewardAcc(
  //       rewardA.publicKey,
  //       rewardADestination
  //     );
  //
  //     console.log('// --------------------------------------- CLAIMED');
  //     await printStructs();
  //
  //     assert(rewardADestAcc.amount.toNumber() > 0);
  //   });
  // });
});
