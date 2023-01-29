import * as anchor from '@project-serum/anchor';
import { AnchorProvider, BN } from '@project-serum/anchor';
import { GemBankClient, ITokenData, NodeWallet } from '../../src';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { assert, expect } from 'chai';
import { beforeEach } from 'mocha';
import {
  buildAndSendTx,
  createAndFundATA,
  createTokenAuthorizationRules,
} from '../../src/gem-common/pnft';

interface IGem {
  gem: ITokenData;
  gemBox: PublicKey;
  gemAmount: BN;
}

interface IVault {
  vault: PublicKey;
  vaultOwner: Keypair;
  vaultAuth: PublicKey;
  gemBoxes: IGem[];
}

/*
 * The purpose of this test is to:
 * 1) create A LOT of concurrent deposits -> make sure the program can handle
 * 2) test finding & deserializing appropriate PDA state accounts
 */
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

  it.only('deposits and withdraws pnft (no ruleset)', async () => {
    //bank
    const bank = Keypair.generate();
    const bankManager = nw.wallet.publicKey;
    await gb.initBank(bank, bankManager, bankManager);

    //vault
    const vaultOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    const { vault, vaultAuth } = await gb.initVault(
      bank.publicKey,
      vaultOwner,
      vaultOwner,
      vaultOwner.publicKey,
      'test_vault'
    );

    const gemOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);

    //ruleset
    const name = 'PlayRule123';
    const ruleSetAddr = await createTokenAuthorizationRules(
      _provider,
      gemOwner,
      name
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

  it('deposits and withdraws pnft (1 ruleset)', async () => {});
});
