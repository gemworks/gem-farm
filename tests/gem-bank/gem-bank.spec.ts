import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import {
  BankFlags,
  GemBankClient,
  ITokenData,
  NodeWallet,
  stringifyPKsAndBNs,
  stringToBytes,
  WhitelistType,
} from '../../src';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';
import { createMetadata } from '../metaplex';

chai.use(chaiAsPromised);

describe('gem bank', () => {
  const _provider = anchor.Provider.env();
  const gb = new GemBankClient(_provider.connection, _provider.wallet as any);
  const nw = new NodeWallet(_provider.connection, _provider.wallet as any);

  // --------------------------------------- bank + vault
  //global state
  let randomWallet: Keypair; //used to test bad transactions with wrong account passed in
  const bank = Keypair.generate();
  let bankManager: Keypair;
  let vaultCreator: Keypair;
  let vaultOwner: Keypair;
  let vault: PublicKey;

  function printBankVaultState() {
    console.log('randomWallet', randomWallet.publicKey.toBase58());
    console.log('bank', bank.publicKey.toBase58());
    console.log('manager', bankManager.publicKey.toBase58());
    console.log('vaultCreator', vaultCreator.publicKey.toBase58());
    console.log('vaultOwner', vaultOwner.publicKey.toBase58());
    console.log('vault', vault.toBase58());
  }

  before('configures accounts', async () => {
    randomWallet = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    bankManager = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    vaultCreator = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    vaultOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
  });

  it('inits bank', async () => {
    await gb.initBank(bank, bankManager, bankManager);

    const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert.equal(
      bankAcc.bankManager.toBase58(),
      bankManager.publicKey.toBase58()
    );
    assert(bankAcc.vaultCount.eq(new BN(0)));
  });

  it('inits vault', async () => {
    //intentionally setting creator as owner, so that we can change later
    ({ vault } = await gb.initVault(
      bank.publicKey,
      vaultCreator,
      vaultCreator,
      vaultCreator.publicKey,
      'test_vault'
    ));

    const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert(bankAcc.vaultCount.eq(new BN(1)));

    const vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.name).to.deep.include.members(stringToBytes('test_vault'));
    assert.equal(vaultAcc.bank.toBase58(), bank.publicKey.toBase58());
    assert.equal(vaultAcc.owner.toBase58(), vaultCreator.publicKey.toBase58());
    assert.equal(
      vaultAcc.creator.toBase58(),
      vaultCreator.publicKey.toBase58()
    );
  });

  it('updates bank manager', async () => {
    const newManager = Keypair.generate();
    await gb.updateBankManager(
      bank.publicKey,
      bankManager,
      newManager.publicKey
    );

    const bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert.equal(
      bankAcc.bankManager.toBase58(),
      newManager.publicKey.toBase58()
    );

    //reset back
    await gb.updateBankManager(
      bank.publicKey,
      newManager,
      bankManager.publicKey
    );
  });

  it('FAILS to update bank manager w/ wrong existing manager', async () => {
    const newManager = Keypair.generate();
    await expect(
      gb.updateBankManager(bank.publicKey, randomWallet, newManager.publicKey)
    ).to.be.rejectedWith('has_one');
  });

  it('updates vault owner', async () => {
    await gb.updateVaultOwner(
      bank.publicKey,
      vault,
      vaultCreator,
      vaultOwner.publicKey
    );

    const vaultAcc = await gb.fetchVaultAcc(vault);
    assert.equal(vaultAcc.owner.toBase58(), vaultOwner.publicKey.toBase58());
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

  describe('gem operations', () => {
    //global state
    let gemAmount: anchor.BN;
    let gem: ITokenData;
    let gemBox: PublicKey;
    let GDR: PublicKey;

    function printGemBoxState() {
      console.log('amount', gemAmount.toString());
      console.log('gem', stringifyPKsAndBNs(gem as any));
      console.log('gemBox', gemBox.toBase58());
      console.log('GDR', GDR.toBase58());
    }

    async function prepDeposit(
      owner: Keypair,
      mintProof?: PublicKey,
      metadata?: PublicKey,
      creatorProof?: PublicKey
    ) {
      return gb.depositGem(
        bank.publicKey,
        vault,
        owner,
        gemAmount,
        gem.tokenMint,
        gem.tokenAcc,
        mintProof,
        metadata,
        creatorProof
      );
    }

    async function prepWithdrawal(
      owner: Keypair,
      receiver: PublicKey,
      gemAmount: BN
    ) {
      return gb.withdrawGem(
        bank.publicKey,
        vault,
        owner,
        gemAmount,
        gem.tokenMint,
        receiver
      );
    }

    async function prepGem(owner?: Keypair) {
      const gemAmount = new BN(1 + Math.ceil(Math.random() * 100)); //min 2
      const gemOwner =
        owner ?? (await nw.createFundedWallet(100 * LAMPORTS_PER_SOL));
      const gem = await nw.createMintAndFundATA(gemOwner.publicKey, gemAmount);

      return { gemAmount, gemOwner, gem };
    }

    beforeEach('creates a fresh gem', async () => {
      //many gems, different amounts, but same owner (who also owns the vault)
      ({ gemAmount, gem } = await prepGem(vaultOwner));
    });

    it('deposits gem', async () => {
      let vaultAuth;
      ({ vaultAuth, gemBox, GDR } = await prepDeposit(vaultOwner));

      const vaultAcc = await gb.fetchVaultAcc(vault);
      assert(vaultAcc.gemBoxCount.eq(new BN(1)));
      assert(vaultAcc.gemCount.eq(gemAmount));
      assert(vaultAcc.rarityPoints.eq(gemAmount));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));
      assert.equal(gemBoxAcc.mint.toBase58(), gem.tokenMint.toBase58());
      assert.equal(gemBoxAcc.owner.toBase58(), vaultAuth.toBase58());

      const GDRAcc = await gb.fetchGDRAcc(GDR);
      assert.equal(GDRAcc.vault.toBase58(), vault.toBase58());
      assert.equal(GDRAcc.gemBoxAddress.toBase58(), gemBox.toBase58());
      assert.equal(GDRAcc.gemMint.toBase58(), gem.tokenMint.toBase58());
      assert(GDRAcc.gemCount.eq(gemAmount));
    });

    it('FAILS to deposit gem w/ wrong owner', async () => {
      await expect(prepDeposit(randomWallet)).to.be.rejectedWith('has_one');
    });

    it('withdraws gem to existing ATA', async () => {
      ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit

      const vaultAcc = await gb.fetchVaultAcc(vault);
      const oldBoxCount = vaultAcc.gemBoxCount;
      const oldGemCount = vaultAcc.gemCount;

      await prepWithdrawal(vaultOwner, gem.owner, gemAmount);

      const vaultAcc2 = await gb.fetchVaultAcc(vault);
      assert(vaultAcc2.gemBoxCount.eq(oldBoxCount.sub(new BN(1))));
      assert(vaultAcc2.gemCount.eq(oldGemCount.sub(gemAmount)));
      assert(vaultAcc2.rarityPoints.eq(oldGemCount.sub(gemAmount)));

      const gemAcc = await gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
      assert(gemAcc.amount.eq(gemAmount));

      //these accounts are expected to close on emptying the gem box
      await expect(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith(
        'Failed to find account'
      );
      await expect(gb.fetchGDRAcc(GDR)).to.be.rejectedWith(
        'Account does not exist'
      );
    });

    it('withdraws gem to existing ATA (but does not empty)', async () => {
      const smallerAmount = gemAmount.sub(new BN(1));

      ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit

      await prepWithdrawal(vaultOwner, gem.owner, smallerAmount);

      const gemAcc = await gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
      assert(gemAcc.amount.eq(smallerAmount));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(new BN(1)));

      const GDRAcc = await gb.fetchGDRAcc(GDR);
      assert(GDRAcc.gemCount.eq(new BN(1)));
    });

    it('withdraws gem to missing ATA', async () => {
      ({ gemBox, GDR } = await prepDeposit(vaultOwner)); //make a fresh deposit

      const missingATA = await gb.findATA(
        gem.tokenMint,
        randomWallet.publicKey
      );
      await prepWithdrawal(vaultOwner, randomWallet.publicKey, gemAmount);

      const gemAcc = await gb.fetchGemAcc(gem.tokenMint, missingATA);
      assert(gemAcc.amount.eq(gemAmount));

      //these accounts are expected to close on emptying the gem box
      await expect(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith(
        'Failed to find account'
      );
      await expect(gb.fetchGDRAcc(GDR)).to.be.rejectedWith(
        'Account does not exist'
      );
    });

    it('FAILS to withdraw gem w/ wrong owner', async () => {
      await prepDeposit(vaultOwner); //make a fresh deposit

      await expect(
        prepWithdrawal(randomWallet, gem.owner, gemAmount)
      ).to.be.rejectedWith('has_one');
    });

    // --------------------------------------- vault lock

    async function prepLock(vaultLocked: boolean) {
      return gb.setVaultLock(bank.publicKey, vault, bankManager, vaultLocked);
    }

    it('un/locks vault successfully', async () => {
      //lock the vault
      await prepLock(true);
      let vaultAcc = await gb.fetchVaultAcc(vault);
      assert.equal(vaultAcc.locked, true);
      //deposit should fail
      await expect(prepDeposit(vaultOwner)).to.be.rejectedWith('0x1784');

      //unlock the vault
      await prepLock(false);
      vaultAcc = await gb.fetchVaultAcc(vault);
      assert.equal(vaultAcc.locked, false);
      //make a real deposit, we need this to try to withdraw later
      await prepDeposit(vaultOwner);

      //lock the vault
      await prepLock(true);
      //withdraw should fail
      await expect(
        prepWithdrawal(vaultOwner, gem.owner, gemAmount)
      ).to.be.rejectedWith('0x1784');

      //finally unlock the vault
      await prepLock(false);
      //should be able to withdraw
      await prepWithdrawal(vaultOwner, gem.owner, gemAmount);
    });

    // --------------------------------------- bank flags

    async function prepFlags(manager: Keypair, flags: number) {
      return gb.setBankFlags(bank.publicKey, manager, flags);
    }

    it('sets bank flags', async () => {
      //freeze vaults
      await prepFlags(bankManager, BankFlags.FreezeVaults);
      const bankAcc = await gb.fetchBankAcc(bank.publicKey);
      assert.equal(bankAcc.flags, BankFlags.FreezeVaults);
      await expect(
        gb.updateVaultOwner(
          bank.publicKey,
          vault,
          vaultOwner,
          vaultCreator.publicKey
        )
      ).to.be.rejectedWith('0x1784');
      await expect(prepLock(true)).to.be.rejectedWith('0x1784');
      await expect(prepDeposit(vaultOwner)).to.be.rejectedWith('0x1784');

      //remove flags to be able to do a real deposit - else can't withdraw
      await prepFlags(bankManager, 0);
      await prepDeposit(vaultOwner);

      //freeze vaults again
      await prepFlags(bankManager, BankFlags.FreezeVaults);
      await expect(
        prepWithdrawal(vaultOwner, gem.owner, gemAmount)
      ).to.be.rejectedWith('0x1784');

      //unfreeze vault in the end
      await prepFlags(bankManager, 0);
    });

    it('FAILS to set bank flags w/ wrong manager', async () => {
      await expect(
        prepFlags(randomWallet, BankFlags.FreezeVaults)
      ).to.be.rejectedWith('has_one');
    });

    // --------------------------------------- whitelists

    describe('whitelists', () => {
      async function prepAddToWhitelist(addr: PublicKey, type: WhitelistType) {
        return gb.addToWhitelist(bank.publicKey, bankManager, addr, type);
      }

      async function prepRemoveFromWhitelist(addr: PublicKey) {
        return gb.removeFromWhitelist(bank.publicKey, bankManager, addr);
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

      async function assertWhitelistClean() {
        const pdas = await gb.fetchAllWhitelistProofPDAs();
        assert.equal(pdas.length, 0);

        const bankAcc = await gb.fetchBankAcc(bank.publicKey);
        assert.equal(bankAcc.whitelistedMints, 0);
        assert.equal(bankAcc.whitelistedCreators, 0);
      }

      beforeEach('checks whitelists are clean', async () => {
        await assertWhitelistClean();
      });

      // --------------- successes

      it('adds/removes mint from whitelist', async () => {
        const { whitelistedMint, whitelistProof } = await whitelistMint(
          gem.tokenMint
        );
        const proofAcc = await gb.fetchWhitelistProofAcc(whitelistProof);
        assert.equal(proofAcc.whitelistType, WhitelistType.Mint);
        assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
        assert.equal(
          proofAcc.whitelistedAddress.toBase58(),
          whitelistedMint.toBase58()
        );

        await prepRemoveFromWhitelist(whitelistedMint);
        await expect(
          gb.fetchWhitelistProofAcc(whitelistProof)
        ).to.be.rejectedWith('Account does not exist');
      });

      it('adds/removes creator from whitelist', async () => {
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          randomWallet.publicKey
        );
        const proofAcc = await gb.fetchWhitelistProofAcc(whitelistProof);
        assert.equal(proofAcc.whitelistType, WhitelistType.Creator);
        assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
        assert.equal(
          proofAcc.whitelistedAddress.toBase58(),
          whitelistedCreator.toBase58()
        );

        await prepRemoveFromWhitelist(whitelistedCreator);
        await expect(
          gb.fetchWhitelistProofAcc(whitelistProof)
        ).to.be.rejectedWith('Account does not exist');
      });

      it('tries to whitelist same mint twice', async () => {
        await whitelistMint(gem.tokenMint);
        const { whitelistedMint } = await whitelistMint(gem.tokenMint);

        const bankAcc = await gb.fetchBankAcc(bank.publicKey);
        assert.equal(bankAcc.whitelistedMints, 1);

        await prepRemoveFromWhitelist(whitelistedMint);
      });

      it('tries to whitelist same creator twice', async () => {
        await whitelistCreator(randomWallet.publicKey);
        const { whitelistedCreator } = await whitelistCreator(
          randomWallet.publicKey
        );

        const bankAcc = await gb.fetchBankAcc(bank.publicKey);
        assert.equal(bankAcc.whitelistedCreators, 1);

        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('changes whitelist from mint to creator', async () => {
        await whitelistMint(randomWallet.publicKey);
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          randomWallet.publicKey
        );

        const proofAcc = await gb.fetchWhitelistProofAcc(whitelistProof);
        assert.equal(proofAcc.whitelistType, WhitelistType.Creator);
        assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
        assert.equal(
          proofAcc.whitelistedAddress.toBase58(),
          whitelistedCreator.toBase58()
        );

        const bankAcc = await gb.fetchBankAcc(bank.publicKey);
        assert.equal(bankAcc.whitelistedCreators, 1);
        assert.equal(bankAcc.whitelistedMints, 0);

        await prepRemoveFromWhitelist(whitelistedCreator);
        await expect(
          gb.fetchWhitelistProofAcc(whitelistProof)
        ).to.be.rejectedWith('Account does not exist');
      });

      // unlikely to be ever needed, but protocol supports this
      it('sets both mint and creator whitelists for same pk', async () => {
        const { whitelistProof } = await gb.addToWhitelist(
          bank.publicKey,
          bankManager,
          randomWallet.publicKey,
          3
        );

        const proofAcc = await gb.fetchWhitelistProofAcc(whitelistProof);
        assert.equal(proofAcc.whitelistType, 3);
        assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
        assert.equal(
          proofAcc.whitelistedAddress.toBase58(),
          randomWallet.publicKey.toBase58()
        );

        const bankAcc = await gb.fetchBankAcc(bank.publicKey);
        assert.equal(bankAcc.whitelistedCreators, 1);
        assert.equal(bankAcc.whitelistedMints, 1);

        await prepRemoveFromWhitelist(randomWallet.publicKey);
        await expect(
          gb.fetchWhitelistProofAcc(whitelistProof)
        ).to.be.rejectedWith('Account does not exist');
      });

      //no need to deserialize anything, if ix goes through w/o error, the deposit succeeds
      it('allows a deposit if mint whitelisted, and creators WL empty', async () => {
        const { whitelistedMint, whitelistProof } = await whitelistMint(
          gem.tokenMint
        );

        await prepDeposit(vaultOwner, whitelistProof);

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
      });

      //this is expected behavior since we're doing an OR check
      it('allows a deposit if mint whitelisted, and creators WL NOT empty', async () => {
        const { whitelistedMint, whitelistProof } = await whitelistMint(
          gem.tokenMint
        );
        const { whitelistedCreator } = await whitelistCreator(
          randomWallet.publicKey //intentionally a random creator
        );

        await prepDeposit(vaultOwner, whitelistProof);

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('allows a deposit if creator verified + whitelisted, and mint WL empty', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint
        );
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          nw.wallet.publicKey //this is the address used to create the metadata
        );

        await prepDeposit(
          vaultOwner,
          PublicKey.default, // since we're not relying on mint whitelist for tx to pass, we simply pass in a dummy PK
          gemMetadata,
          whitelistProof
        );

        //clean up after
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      //again we're simply checking OR behavior
      it('allows a deposit if creator verified + whitelisted, and mint WL NOT empty', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint
        );
        const { gem: randomGem } = await prepGem();
        const { whitelistedMint } = await whitelistMint(randomGem.tokenMint); //random mint intentionally
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          nw.wallet.publicKey //this is the address used to create the metadata
        );

        await prepDeposit(
          vaultOwner,
          PublicKey.default,
          gemMetadata,
          whitelistProof
        );

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('allows a deposit if creator verified + whitelisted, but listed LAST', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint,
          5,
          5
        );
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          nw.wallet.publicKey //this is the address used to create the metadata
        );

        await prepDeposit(
          vaultOwner,
          PublicKey.default,
          gemMetadata,
          whitelistProof
        );

        //clean up after
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      // --------------- failures

      it('FAILS a deposit if creator whitelisted but not verified (signed off)', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint,
          5,
          1,
          true
        );
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          nw.wallet.publicKey //this is the address used to create the metadata
        );

        await expect(
          prepDeposit(
            vaultOwner,
            PublicKey.default,
            gemMetadata,
            whitelistProof
          )
        ).to.be.rejectedWith('0x1786');

        //clean up after
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('FAILS a deposit if mint whitelist exists, but mint not whitelisted', async () => {
        //setup the whitelist for the WRONG gem
        const { gem: randomGem } = await prepGem();
        const { whitelistedMint, whitelistProof } = await whitelistMint(
          randomGem.tokenMint
        );

        await expect(
          prepDeposit(vaultOwner, whitelistProof)
        ).to.be.rejectedWith('0x1786');

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
      });

      it('FAILS a deposit if creator whitelist exists, but creator not whitelisted', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint
        );
        //setup the whitelist for the WRONG creator
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          randomWallet.publicKey
        );

        await expect(
          prepDeposit(
            vaultOwner,
            PublicKey.default,
            gemMetadata,
            whitelistProof
          )
        ).to.be.rejectedWith('0x1786');

        //clean up after
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('FAILS to verify when proof is marked as "mint", but is actually for creator', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint
        );
        //intentionally passing in the wallet's address not the mint's
        //now the creator has a proof, but it's marked as "mint"
        const { whitelistedMint, whitelistProof } = await whitelistMint(
          nw.wallet.publicKey
        );
        //let's also whitelist a random creator, so that both branches of checks are triggered
        const { whitelistedCreator } = await whitelistCreator(
          randomWallet.publicKey
        );

        await expect(
          prepDeposit(
            vaultOwner,
            PublicKey.default,
            gemMetadata,
            whitelistProof
          )
        ).to.be.rejectedWith('0x1786');

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('FAILS to verify when proof is marked as "creator", but is actually for mint', async () => {
        const gemMetadata = await createMetadata(
          nw.conn,
          nw.wallet,
          gem.tokenMint
        );
        //intentionally passing in the mint's address not the creator's
        //now the mint has a proof, but it's marked as "creator"
        const { whitelistedCreator, whitelistProof } = await whitelistCreator(
          gem.tokenMint
        );
        //let's also whitelist a random mint, so that both branches of checks are triggered
        const { whitelistedMint } = await whitelistMint(
          Keypair.generate().publicKey
        );

        //unfortunately it's rejected not with the error we'd like
        //the issue is that when mint branch fails (as it should, with the correct error),
        //it falls back to checking creator branch, which fails with the wrong error
        await expect(
          prepDeposit(
            vaultOwner,
            whitelistProof,
            gemMetadata,
            PublicKey.default
          )
        ).to.be.rejectedWith('0x1786');

        //clean up after
        await prepRemoveFromWhitelist(whitelistedMint);
        await prepRemoveFromWhitelist(whitelistedCreator);
      });

      it('correctly fetches proof PDAs by type', async () => {
        // create 3 mint proofs
        const { whitelistedMint: m1 } = await whitelistMint(
          Keypair.generate().publicKey
        );
        const { whitelistedMint: m2 } = await whitelistMint(
          Keypair.generate().publicKey
        );
        const { whitelistedMint: m3 } = await whitelistMint(
          Keypair.generate().publicKey
        );

        // and 1 creator proof
        const { whitelistedCreator: c1 } = await whitelistCreator(
          Keypair.generate().publicKey
        );

        // verify counts
        let pdas = await gb.fetchAllWhitelistProofPDAs();
        assert.equal(pdas.length, 4);

        pdas = await gb.fetchAllWhitelistProofPDAs(bank.publicKey);
        assert.equal(pdas.length, 4);

        //clean up after
        await prepRemoveFromWhitelist(m1);
        await prepRemoveFromWhitelist(m2);
        await prepRemoveFromWhitelist(m3);
        await prepRemoveFromWhitelist(c1);
      });
    });
  });
});
