import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { ITokenData } from '../utils/account';
import { u64 } from '@solana/spl-token';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { stringToBytes, toBase58 } from '../utils/types';
import { BankFlags, GemBankClient } from './gem-bank.client';
import { createMetadata } from '../utils/metaplex';

chai.use(chaiAsPromised);

describe('gem bank', () => {
  const _provider = anchor.Provider.env();
  const gb = new GemBankClient(
    _provider.connection,
    _provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state
  //used to test bad transactions with wrong account passed in
  let randomWallet: Keypair;

  //bank
  const bank = Keypair.generate();
  let manager: Keypair;

  //vault
  let vaultCreator: Keypair;
  let vaultOwner: Keypair;
  let vault: PublicKey;

  //gem box
  let gemAmount: anchor.BN;
  let gemOwner: Keypair;
  let gem: ITokenData;
  let gemBox: PublicKey;
  let GDR: PublicKey;
  let gemMetadata: PublicKey;

  function printState() {
    console.log('randomWallet', randomWallet.publicKey.toBase58());

    console.log('bank', bank.publicKey.toBase58());
    console.log('manager', manager.publicKey.toBase58());

    console.log('vaultCreator', vaultCreator.publicKey.toBase58());
    console.log('vaultOwner', vaultOwner.publicKey.toBase58());
    console.log('vault', vault.toBase58());

    console.log('amount', gemAmount.toString());
    console.log('gemOwner', gemOwner.publicKey.toBase58());
    console.log('gem', toBase58(gem as any));
    // console.log('gemBox', gemBox.toBase58());
    // console.log('GDR', GDR.toBase58());
    console.log('gemMetadata', gemMetadata);
  }

  before('configures accounts', async () => {
    randomWallet = await gb.createWallet(100 * LAMPORTS_PER_SOL);

    manager = await gb.createWallet(100 * LAMPORTS_PER_SOL);

    vaultCreator = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    vaultOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
  });

  // --------------------------------------- bank

  it('inits bank', async () => {
    await gb.startBank(bank, manager);

    const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert.equal(bankAcc.manager.toBase58(), manager.publicKey.toBase58());
    assert(bankAcc.vaultCount.eq(new BN(0)));
  });

  // --------------------------------------- vault

  it('inits vault', async () => {
    //intentionally setting creator as owner, so that we can change later
    ({ vault } = await gb.createVault(
      bank.publicKey,
      vaultCreator,
      vaultCreator.publicKey,
      'test_vault'
    ));

    const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert(bankAcc.vaultCount.eq(new BN(1)));

    const vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.name).to.deep.include.members(stringToBytes('test_vault'));
    assert.equal(vaultAcc.bank.toBase58, bank.publicKey.toBase58);
    assert.equal(vaultAcc.owner.toBase58, vaultCreator.publicKey.toBase58);
    assert.equal(vaultAcc.creator.toBase58, vaultCreator.publicKey.toBase58);
  });

  it('updates vault owner', async () => {
    await gb.updateVaultOwner(
      bank.publicKey,
      vault,
      vaultCreator,
      vaultOwner.publicKey
    );

    const vaultAcc = await gb.fetchVaultAcc(vault);
    assert.equal(vaultAcc.owner.toBase58, vaultOwner.publicKey.toBase58);
  });

  it('FAILS to update vault owner w/ wrong existing owner', async () => {
    await expect(
      gb.updateVaultOwner(
        bank.publicKey,
        vault,
        randomWallet,
        vaultOwner.publicKey
      )
    ).to.be.rejectedWith('has_one');
  });

  // --------------------------------------- gem boxes

  describe('gem boxes', () => {
    async function prepDeposit(owner: Keypair) {
      return gb.depositGem(
        bank.publicKey,
        vault,
        owner,
        gemAmount,
        gem.tokenMint,
        gem.tokenAcc,
        gemMetadata,
        gemOwner
      );
    }

    async function prepWithdrawal(
      owner: Keypair,
      destinationAcc: PublicKey,
      receiver: PublicKey,
      gemAmount: BN
    ) {
      return gb.withdrawGem(
        bank.publicKey,
        vault,
        owner,
        gemAmount,
        gem.tokenMint,
        destinationAcc,
        receiver
      );
    }

    beforeEach('creates a fresh gem', async () => {
      gemAmount = new BN(Math.ceil(Math.random() * 100));
      gemOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
      gem = await gb.createMintAndATA(gemOwner.publicKey, gemAmount);
      gemMetadata = await createMetadata(gb.conn, gb.wallet, gem.tokenMint);
    });

    it('deposits gem', async () => {
      printState();

      let vaultAuth;
      ({ vaultAuth, gemBox, GDR } = await prepDeposit(vaultOwner));

      const vaultAcc = await gb.fetchVaultAcc(vault);
      assert(vaultAcc.gemBoxCount.eq(new BN(1)));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));
      assert.equal(gemBoxAcc.mint.toBase58(), gem.tokenMint.toBase58());
      assert.equal(gemBoxAcc.owner.toBase58(), vaultAuth.toBase58());

      const GDRAcc = await gb.fetchGDRAcc(GDR);
      assert.equal(GDRAcc.vault.toBase58(), vault.toBase58());
      assert.equal(GDRAcc.gemBoxAddress.toBase58(), gemBox.toBase58());
      assert.equal(GDRAcc.gemMint.toBase58(), gem.tokenMint.toBase58());
      assert(GDRAcc.gemAmount.eq(gemAmount));
    });

    //   it('FAILS to deposit gem w/ wrong owner', async () => {
    //     await expect(prepDeposit(randomWallet)).to.be.rejectedWith('has_one');
    //   });
    //
    //   it('withdraws gem to existing ATA', async () => {
    //     ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit
    //
    //     const vaultAcc = await gb.fetchVaultAcc(vault);
    //     const oldCount = vaultAcc.gemBoxCount.toNumber();
    //
    //     await prepWithdrawal(vaultOwner, gem.tokenAcc, gem.owner, gemAmount);
    //
    //     const vaultAcc2 = await gb.fetchVaultAcc(vault);
    //     assert.equal(vaultAcc2.gemBoxCount.toNumber(), oldCount - 1);
    //
    //     const gemAcc = await gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
    //     assert(gemAcc.amount.eq(gemAmount));
    //
    //     //these accounts are expected to close on emptying the gem box
    //     await expect(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith(
    //       'Failed to find account'
    //     );
    //     await expect(gb.fetchGDRAcc(GDR)).to.be.rejectedWith(
    //       'Account does not exist'
    //     );
    //   });
    //
    //   it('withdraws gem to existing ATA (but does not empty)', async () => {
    //     const smallerAmount = gemAmount.sub(new BN(1));
    //
    //     ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit
    //
    //     await prepWithdrawal(vaultOwner, gem.tokenAcc, gem.owner, smallerAmount);
    //
    //     const gemAcc = await gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
    //     assert(gemAcc.amount.eq(smallerAmount));
    //
    //     const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
    //     assert(gemBoxAcc.amount.eq(new BN(1)));
    //
    //     const GDRAcc = await gb.fetchGDRAcc(GDR);
    //     assert(GDRAcc.gemAmount.eq(new BN(1)));
    //   });
    //
    //   it('withdraws gem to missing ATA', async () => {
    //     ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit
    //
    //     const missingATA = await gb.getATA(gem.tokenMint, randomWallet.publicKey);
    //     await prepWithdrawal(
    //       vaultOwner,
    //       missingATA,
    //       randomWallet.publicKey,
    //       gemAmount
    //     );
    //
    //     const gemAcc = await gb.fetchGemAcc(gem.tokenMint, missingATA);
    //     assert(gemAcc.amount.eq(gemAmount));
    //
    //     //these accounts are expected to close on emptying the gem box
    //     await expect(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith(
    //       'Failed to find account'
    //     );
    //     await expect(gb.fetchGDRAcc(GDR)).to.be.rejectedWith(
    //       'Account does not exist'
    //     );
    //   });
    //
    //   it('FAILS to withdraw gem w/ wrong owner', async () => {
    //     await prepDeposit(vaultOwner); //make a fresh deposit
    //
    //     await expect(
    //       prepWithdrawal(randomWallet, gem.tokenAcc, gem.owner, gemAmount)
    //     ).to.be.rejectedWith('has_one');
    //   });
    //
    //   // --------------------------------------- vault lock
    //
    //   async function prepLock(vaultLocked: boolean) {
    //     return gb.setVaultLock(bank.publicKey, vault, vaultOwner, vaultLocked);
    //   }
    //
    //   it('un/locks vault successfully', async () => {
    //     //lock the vault
    //     await prepLock(true);
    //     let vaultAcc = await gb.fetchVaultAcc(vault);
    //     assert.equal(vaultAcc.locked, true);
    //     //deposit should fail
    //     await expect(prepDeposit(vaultOwner)).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //
    //     //unlock the vault
    //     await prepLock(false);
    //     vaultAcc = await gb.fetchVaultAcc(vault);
    //     assert.equal(vaultAcc.locked, false);
    //     //make a real deposit, we need this to try to withdraw later
    //     await prepDeposit(vaultOwner);
    //
    //     //lock the vault
    //     await prepLock(true);
    //     //withdraw should fail
    //     await expect(
    //       prepWithdrawal(vaultOwner, gem.tokenAcc, gem.owner, gemAmount)
    //     ).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //
    //     //finally unlock the vault
    //     await prepLock(false);
    //     //should be able to withdraw
    //     await prepWithdrawal(vaultOwner, gem.tokenAcc, gem.owner, gemAmount);
    //   });
    //
    //   // --------------------------------------- bank flags
    //
    //   async function prepFlags(manager: Keypair, flags: number) {
    //     return gb.setBankFlags(bank.publicKey, manager, flags);
    //   }
    //
    //   it('sets bank flags', async () => {
    //     //freeze vaults
    //     await prepFlags(manager, BankFlags.FreezeVaults);
    //     const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    //     assert.equal(bankAcc.flags, BankFlags.FreezeVaults);
    //     await expect(
    //       gb.updateVaultOwner(
    //         bank.publicKey,
    //         vault,
    //         vaultOwner,
    //         vaultCreator.publicKey
    //       )
    //     ).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //     await expect(prepLock(true)).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //     await expect(prepDeposit(vaultOwner)).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //
    //     //remove flags to be able to do a real deposit - else can't withdraw
    //     await prepFlags(manager, 0);
    //     await prepDeposit(vaultOwner);
    //
    //     //freeze vaults again
    //     await prepFlags(manager, BankFlags.FreezeVaults);
    //     await expect(
    //       prepWithdrawal(vaultOwner, gem.tokenAcc, gem.owner, gemAmount)
    //     ).to.be.rejectedWith(
    //       'vault is currently locked or frozen and cannot be accessed'
    //     );
    //
    //     //unfreeze vault in the end
    //     await prepFlags(manager, 0);
    //   });
    //
    //   it('FAILS to set bank flags w/ wrong manager', async () => {
    //     await expect(
    //       prepFlags(randomWallet, BankFlags.FreezeVaults)
    //     ).to.be.rejectedWith('has_one');
    //   });
  });
});
