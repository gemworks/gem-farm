import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { GemBankClient } from './gem-bank.client';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { ITokenData } from '../utils/account';
import { assert } from 'chai';

interface IGem {
  gem: ITokenData;
  gemBox: PublicKey;
  gemOwner: Keypair;
}

interface IVault {
  vault: PublicKey;
  vaultOwner: Keypair;
  vaultAuth: PublicKey;
  gemBoxes: IGem[];
}

/*
 * The purpose of this test is to
 * 1) create A LOT of deposits and see how they work
 * 2) try to locate the appropriate PDAs, which will be used in FE
 */
describe('looper', () => {
  const provider = anchor.Provider.env();
  const gb = new GemBankClient(
    provider.connection,
    provider.wallet as anchor.Wallet
  );

  const nVaults = 10;
  const nGemsPerVault = 5;

  const bank = Keypair.generate();
  let vaults: IVault[] = [];

  async function prepVault() {
    const vaultOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);

    const { vault, vaultAuth } = await gb.createVault(
      bank.publicKey,
      vaultOwner,
      vaultOwner.publicKey
    );

    vaults.push({
      vault,
      vaultOwner,
      vaultAuth,
      gemBoxes: [],
    });
  }

  async function prepGemDeposit(vault: IVault) {
    const gemAmount = new BN(Math.ceil(Math.random() * 100));
    const gemOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    const gem = await gb.createMintAndATA(gemOwner.publicKey, gemAmount);

    const { gemBox } = await gb.depositGem(
      bank.publicKey,
      vault.vault,
      vault.vaultOwner,
      gemAmount,
      gem.tokenMint,
      gem.tokenAcc,
      gemOwner
    );
    vault.gemBoxes.push({
      gem,
      gemBox,
      gemOwner,
    });
  }

  async function looper() {
    //bank
    await gb.startBank(bank, gb.wallet.publicKey);
    console.log('bank ready');

    //vaults
    const vaultPromises = [];
    for (let i = 0; i < nVaults; i++) {
      vaultPromises.push(prepVault());
    }
    await Promise.all(vaultPromises);
    console.log('vaults ready');

    //gems
    const gemPromises: any[] = [];
    vaults.forEach((v: IVault) => {
      for (let i = 0; i < nGemsPerVault; i++) {
        gemPromises.push(prepGemDeposit(v));
      }
    });
    await Promise.all(gemPromises);
    console.log('gems ready');
  }

  it('creates A LOT of PDAs & reads them back correctly', async () => {
    await looper();

    const bankPDAs = await gb.fetchAllBankPDAs();
    const vaultPDAs = await gb.fetchAllVaultPDAs();
    const gdrPDAs = await gb.fetchAllGdrPDAs();

    assert.equal(bankPDAs.length, 1);
    assert.equal(vaultPDAs.length, nVaults);
    assert.equal(gdrPDAs.length, nVaults * nGemsPerVault);
  });
});
