import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  defaultFarmConfig,
  defaultFixedConfig,
  GemFarmTester,
} from '../gem-farm.tester';
import { AnchorProvider, BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  FarmConfig,
  feeAccount,
  NodeWallet,
  pause,
  RewardType,
  toBN,
  WhitelistType,
} from '../../../src';
import {
  createAndFundATA,
  createTokenAuthorizationRules,
} from '../../../src/gem-common/pnft';
import * as anchor from '@project-serum/anchor';

chai.use(chaiAsPromised);

const updatedFarmConfig = <FarmConfig>{
  minStakingPeriodSec: new BN(0),
  cooldownPeriodSec: new BN(0),
  unstakingFeeLamp: new BN(LAMPORTS_PER_SOL / 2),
};

const creator = new PublicKey('75ErM1QcGjHiPMX7oLsf9meQdGSUs4ZrwS2X8tBpsZhA');

describe('misc', () => {
  const _provider = AnchorProvider.local();
  let gf = new GemFarmTester();
  const nw = new NodeWallet(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );
  let gemOwner;

  beforeEach('preps accs', async () => {
    await gf.prepAccounts(5000000000, gf.randomInt(1, 3), gf.randomInt(1, 3));
    await gf.callInitFarm(defaultFarmConfig, RewardType.Fixed);
    await gf.prepGemRarities();
    await gf.callInitFarmer(gf.farmer1Identity);
    await gf.callInitFarmer(gf.farmer2Identity);
    await gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
    await gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
    await gf.callAuthorize();
    await gf.callFundReward(undefined, defaultFixedConfig);
    gemOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
  });

  it('flash deposits a pnft (1 ruleset, whitelisted mint)', async () => {
    //ruleset
    const ruleSetAddr = await createTokenAuthorizationRules(
      _provider,
      gemOwner
    );

    //gem
    const creators = Array(5)
      .fill(null)
      .map((_) => ({ address: Keypair.generate().publicKey, share: 20 }));
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: gf.farmer1Identity,
      creators,
      royaltyBps: 1000,
      programmable: true,
      ruleSetAddr,
    });

    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    // call stake
    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist mint
    const { whitelistProof } = await gf.callAddToBankWhitelist(
      mint,
      WhitelistType.Mint
    );

    //flash deposit after vault locked
    await gf.callFlashDepositPnft(
      mint,
      ata,
      gf.farmer1Identity,
      whitelistProof
    );
  });

  it('flash deposits a pnft (no rulesets, whitelisted mint)', async () => {
    //gem
    const creators = Array(5)
      .fill(null)
      .map((_) => ({ address: Keypair.generate().publicKey, share: 20 }));
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: gf.farmer1Identity,
      creators,
      royaltyBps: 1000,
      programmable: true,
    });

    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    // call stake
    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist mint
    const { whitelistProof } = await gf.callAddToBankWhitelist(
      mint,
      WhitelistType.Mint
    );

    //flash deposit after vault locked
    await gf.callFlashDepositPnft(
      mint,
      ata,
      gf.farmer1Identity,
      whitelistProof
    );

    //this is enough to verify it worked
    await pause(1000);
    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(new BN(1))));
    assert.isTrue(vaultAcc.locked);
  });

  it('flash deposits a normal nft via pnft ix (whitelisted mint)', async () => {
    //gem
    const creators = Array(5)
      .fill(null)
      .map((_) => ({ address: Keypair.generate().publicKey, share: 20 }));
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: gf.farmer1Identity,
      creators,
      royaltyBps: 1000,
    });

    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    // call stake
    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist mint
    const { whitelistProof } = await gf.callAddToBankWhitelist(
      mint,
      WhitelistType.Mint
    );

    //flash deposit after vault locked
    await gf.callFlashDepositPnft(
      mint,
      ata,
      gf.farmer1Identity,
      whitelistProof
    );

    //this is enough to verify it worked
    await pause(1000);
    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(new BN(1))));
    assert.isTrue(vaultAcc.locked);
  });

  it('flash deposits a normal nft via pnft ix (whitelisted creator)', async () => {
    //gem
    const creators = await Promise.all(
      Array(2)
        .fill(null)
        .map(async (_) => {
          const creator = await nw.createFundedWallet(LAMPORTS_PER_SOL);
          return { address: creator.publicKey, share: 50, authority: creator };
        })
    );
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: gf.farmer1Identity,
      creators,
      royaltyBps: 1000,
    });

    //get the gems back, we'll need them for 2 separate deposits
    await gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);

    // call stake
    const initialDeposit = new BN(1); //drop 1 existing gem, need to lock the vault
    await gf.callDeposit(initialDeposit, gf.farmer1Identity);
    const { vault } = await gf.callStake(gf.farmer1Identity);

    //whitelist creator
    const { whitelistProof } = await gf.callAddToBankWhitelist(
      creators[0].address,
      WhitelistType.Creator
    );

    //flash deposit after vault locked
    await gf.callFlashDepositPnft(
      mint,
      ata,
      gf.farmer1Identity,
      PublicKey.default,
      whitelistProof
    );

    //this is enough to verify it worked
    await pause(1000);
    const vaultAcc = await gf.fetchVaultAcc(vault);
    assert(vaultAcc.gemCount.eq(initialDeposit.add(new BN(1))));
    assert.isTrue(vaultAcc.locked);
  });
});
