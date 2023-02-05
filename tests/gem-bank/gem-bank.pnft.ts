import * as anchor from '@project-serum/anchor';
import { AnchorProvider, BN } from '@project-serum/anchor';
import {
  GemBankClient,
  ITokenData,
  NodeWallet,
  WhitelistType,
} from '../../src';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { beforeEach } from 'mocha';
import {
  buildAndSendTx,
  createAndFundATA,
  createCoreGemLUT,
  createTokenAuthorizationRules,
} from '../../src/gem-common/pnft';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';

chai.use(chaiAsPromised);

describe('gem bank pnft', () => {
  const _provider = AnchorProvider.local();
  const gb = new GemBankClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );
  const nw = new NodeWallet(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );

  let bank;
  let bankManager;
  let vault;
  let vaultAuth;
  let vaultOwner;
  let gemOwner;

  async function prepAddToWhitelist(addr: PublicKey, type: WhitelistType) {
    return gb.addToWhitelist(bank.publicKey, bankManager, addr, type);
  }

  async function whitelistMint(whitelistedMint: PublicKey) {
    const { whitelistProof } = await prepAddToWhitelist(
      whitelistedMint,
      WhitelistType.Mint
    );
    return { whitelistedMint, whitelistProof };
  }

  async function whitelistCreator(whitelistedCreator: PublicKey) {
    const { whitelistProof } = await prepAddToWhitelist(
      whitelistedCreator,
      WhitelistType.Creator
    );
    return { whitelistedCreator, whitelistProof };
  }

  beforeEach(async () => {
    //bank
    bank = Keypair.generate();
    bankManager = nw.wallet.publicKey;
    await gb.initBank(bank, bankManager, bankManager);

    //vault
    vaultOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    ({ vault, vaultAuth } = await gb.initVault(
      bank.publicKey,
      vaultOwner,
      vaultOwner,
      vaultOwner.publicKey,
      'test_vault'
    ));

    gemOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
  });

  it('deposits and withdraws pnft (no ruleset)', async () => {
    //gem
    const creators = Array(5)
      .fill(null)
      .map((_) => ({ address: Keypair.generate().publicKey, share: 20 }));
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
      programmable: true,
    });

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs,
      extraSigners: [vaultOwner],
    });

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(1);

    //withdraw
    const { ixs: withdrawIxs } = await gb.buildWithdrawGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs: withdrawIxs,
      extraSigners: [vaultOwner],
    });

    vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(0);
  });

  it('deposits and withdraws pnft (1 ruleset)', async () => {
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
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
      programmable: true,
      ruleSetAddr,
    });

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs,
      extraSigners: [vaultOwner],
    });

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(1);

    //withdraw
    const { ixs: withdrawIxs } = await gb.buildWithdrawGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs: withdrawIxs,
      extraSigners: [vaultOwner],
    });

    vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(0);
  });

  it('deposits and withdraws pnft (1 ruleset + whitelisted mint)', async () => {
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
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
      programmable: true,
      ruleSetAddr,
    });

    //whitelist mint
    const { whitelistProof } = await whitelistMint(mint);

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata,
      whitelistProof
    );
    await buildAndSendTx({
      provider: _provider,
      ixs,
      extraSigners: [vaultOwner],
    });

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(1);

    //withdraw
    const { ixs: withdrawIxs } = await gb.buildWithdrawGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs: withdrawIxs,
      extraSigners: [vaultOwner],
    });

    vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(0);
  });

  it('deposits and withdraws pnft (1 ruleset + whitelisted creator)', async () => {
    //ruleset
    const ruleSetAddr = await createTokenAuthorizationRules(
      _provider,
      gemOwner
    );

    //gem
    const creators = await Promise.all(
      Array(5)
        .fill(null)
        .map(async (_) => {
          const creator = await nw.createFundedWallet(LAMPORTS_PER_SOL);
          // TODO: creator verification currently not supported for pNFTs
          // return { address: creator.publicKey, share: 20, authority: creator };
          return { address: creator.publicKey, share: 20 };
        })
    );
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
      programmable: true,
      ruleSetAddr,
    });

    //whitelist mint
    const { whitelistProof } = await whitelistCreator(creators[0].address);

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata,
      PublicKey.default, //to skip mint verification
      whitelistProof //creator verification
    );
    // TODO: hence expect this to fail
    await expect(
      buildAndSendTx({
        provider: _provider,
        ixs,
        extraSigners: [vaultOwner],
      })
    ).to.be.rejectedWith('0x1786');

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(0);
  });

  it('deposits and withdraws a normal nft via pnft ix (whitelisted mint)', async () => {
    //gem
    const creators = Array(5)
      .fill(null)
      .map((_) => ({ address: Keypair.generate().publicKey, share: 20 }));
    const { mint, ata } = await createAndFundATA({
      provider: _provider,
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
    });

    //whitelist mint
    const { whitelistProof } = await whitelistMint(mint);

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata,
      whitelistProof
    );
    await buildAndSendTx({
      provider: _provider,
      ixs,
      extraSigners: [vaultOwner],
    });

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(1);

    //withdraw
    const { ixs: withdrawIxs } = await gb.buildWithdrawGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata
    );
    await buildAndSendTx({
      provider: _provider,
      ixs: withdrawIxs,
      extraSigners: [vaultOwner],
    });

    vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(0);
  });

  it('deposits and withdraws a normal nft via pnft ix (whitelisted creator)', async () => {
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
      owner: vaultOwner,
      creators,
      royaltyBps: 1000,
    });

    //whitelist mint
    const { whitelistProof } = await whitelistCreator(creators[0].address);

    //deposit
    const { ixs } = await gb.buildDepositGemPnft(
      bank.publicKey,
      vault,
      vaultOwner,
      new BN(1),
      mint,
      ata,
      PublicKey.default, //to skip mint verification
      whitelistProof //creator verification
    );
    await buildAndSendTx({
      provider: _provider,
      ixs,
      extraSigners: [vaultOwner],
    });

    let vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.gemCount.toNumber()).to.eq(1);
  });
});
