import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { GemBankClient, ITokenData, NodeWallet } from '../../src';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { assert } from 'chai';

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
describe('looper', () => {
  const _provider = anchor.Provider.env();
  const gb = new GemBankClient(
    _provider.connection,
    // @ts-ignore
    _provider.wallet as anchor.Wallet
  );
  const nw = new NodeWallet(
    _provider.connection,
    // @ts-ignore
    _provider.wallet as anchor.Wallet
  );

  const nVaults = 10;
  const nGemsPerVault = 5;

  const bank = Keypair.generate();
  const bankManager = nw.wallet.publicKey;

  let vaults: IVault[] = [];

  async function prepVault() {
    const vaultOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);

    const { vault, vaultAuth } = await gb.initVault(
      bank.publicKey,
      vaultOwner,
      vaultOwner,
      vaultOwner.publicKey,
      'test_vault'
    );

    vaults.push({
      vault,
      vaultOwner,
      vaultAuth,
      gemBoxes: [],
    });
  }

  async function prepGemDeposit(vault: IVault) {
    //many gems, different amounts, but same owner (who also owns the vault)
    const { gemAmount, gem } = await prepGem(vault.vaultOwner);

    const { gemBox } = await gb.depositGem(
      bank.publicKey,
      vault.vault,
      vault.vaultOwner,
      gemAmount,
      gem.tokenMint,
      gem.tokenAcc
    );
    vault.gemBoxes.push({
      gem,
      gemBox,
      gemAmount,
    });
  }

  async function prepGemWithdrawal(vault: IVault, gemIdx: number) {
    const g = vault.gemBoxes[gemIdx];

    await gb.withdrawGem(
      bank.publicKey,
      vault.vault,
      vault.vaultOwner,
      g.gemAmount,
      g.gem.tokenMint,
      vault.vaultOwner.publicKey //the receiver = owner of gemDest, NOT gemDest itself
    );
  }

  async function prepGem(owner?: Keypair) {
    const gemAmount = new BN(10); //here intentionally using 10
    const gemOwner =
      owner ?? (await nw.createFundedWallet(100 * LAMPORTS_PER_SOL));
    const gem = await nw.createMintAndFundATA(gemOwner.publicKey, gemAmount);

    return { gemAmount, gemOwner, gem };
  }

  async function depositLooper() {
    //bank
    await gb.initBank(bank, bankManager, bankManager);
    console.log('bank started');

    //vaults
    const vaultPromises = [];
    for (let i = 0; i < nVaults; i++) {
      vaultPromises.push(prepVault());
    }
    await Promise.all(vaultPromises);
    console.log('vaults created');

    //gems
    const gemPromises: any[] = [];
    vaults.forEach((v: IVault) => {
      for (let i = 0; i < nGemsPerVault; i++) {
        gemPromises.push(prepGemDeposit(v));
      }
    });
    await Promise.all(gemPromises);
    console.log('gems deposited');
  }

  async function withdrawalLooper() {
    const promises: any[] = [];
    vaults.forEach((v: IVault) => {
      for (let i = 0; i < nGemsPerVault; i++) {
        promises.push(prepGemWithdrawal(v, i));
      }
    });
    await Promise.all(promises);
    console.log('gems withdrawn');
  }

  it('creates A LOT of PDAs & fetches them correctly', async () => {
    await depositLooper();

    // --------------------------------------- w/o constraints
    let bankPDAs = await gb.fetchAllBankPDAs();
    let vaultPDAs = await gb.fetchAllVaultPDAs();
    let gdrPDAs = await gb.fetchAllGdrPDAs();

    //verify correct # of accounts found
    assert.equal(bankPDAs.length, 1);
    assert.equal(vaultPDAs.length, nVaults);
    assert.equal(gdrPDAs.length, nVaults * nGemsPerVault);

    //verify correct # of accounts stored
    let bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert(bankAcc.vaultCount.eq(new BN(nVaults)));

    for (const v of vaults) {
      const vaultAcc = await gb.fetchVaultAcc(v.vault);
      assert(vaultAcc.gemBoxCount.eq(new BN(nGemsPerVault)));
      assert(vaultAcc.gemCount.eq(new BN(nGemsPerVault).mul(new BN(10))));
      assert(vaultAcc.rarityPoints.eq(new BN(nGemsPerVault).mul(new BN(10))));
    }

    // --------------------------------------- w/ constraints
    bankPDAs = await gb.fetchAllBankPDAs(bankManager);
    vaultPDAs = await gb.fetchAllVaultPDAs(bank.publicKey);

    //verify correct # of accounts found
    assert.equal(bankPDAs.length, 1);
    assert.equal(vaultPDAs.length, nVaults);

    for (const v of vaults) {
      const gdrPDAsByVault = await gb.fetchAllGdrPDAs(v.vault);
      assert.equal(gdrPDAsByVault.length, nGemsPerVault);
    }
  });

  it('reduces PDA count after closure', async () => {
    await withdrawalLooper();

    const gdrPDAs = await gb.fetchAllGdrPDAs();

    //verify correct # of accounts found
    assert.equal(gdrPDAs.length, 0); //reduced after closure

    //verify correct # of accounts stored
    for (const v of vaults) {
      const vaultAcc = await gb.fetchVaultAcc(v.vault);
      assert(vaultAcc.gemBoxCount.eq(new BN(0))); //reduced after closure
      assert(vaultAcc.gemCount.eq(new BN(0)));
      assert(vaultAcc.rarityPoints.eq(new BN(0)));
    }
  });
});
