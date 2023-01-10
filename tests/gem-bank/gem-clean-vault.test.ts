import * as anchor from '@project-serum/anchor';
import { AnchorProvider, BN } from '@project-serum/anchor';
import {
  Transaction,
  TransactionInstruction,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  GemBankClient,
  ITokenData,
  NodeWallet,
  stringToBytes,
} from '../../src';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe } from 'mocha';
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { GEM_BANK_PROG_ID } from '../../src/index';

chai.use(chaiAsPromised);

function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): TransactionInstruction {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedToken, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: associatedTokenProgramId,
    data: Buffer.alloc(0),
  });
}

describe('gem clean vault', () => {
  const _provider = AnchorProvider.local();
  const gb = new GemBankClient(_provider.connection, _provider.wallet as any);
  const nw = new NodeWallet(_provider.connection, _provider.wallet as any);

  console.log('\nTesting clean-vault\n\n');

  // --------------------------------------- bank + vault
  //global state
  let randomWallet: Keypair; //used to test bad transactions with wrong account passed in
  const bank = Keypair.generate();
  let bankManager: Keypair;
  let vaultCreator: Keypair;
  let vaultOwner: Keypair;
  let vault: PublicKey;
  let GDR: PublicKey;
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

  describe('clean vault operations', () => {
    //global state
    let gemAmount: anchor.BN;
    let gem: ITokenData;
    let gemBox: PublicKey;
    const recipient = anchor.web3.Keypair.generate();
    const bonk_auth = anchor.web3.Keypair.generate();
    const fake_bonk_auth = anchor.web3.Keypair.generate(); // secondary SPL
    const PaYeR = anchor.web3.Keypair.generate();
    let bonkToken: Token;
    let fakeBonkToken: Token;
    let recipientAta_bonk;
    let recipientAta_fake_bonk;
    let vaultAta_bonk;
    let vaultAta_fake_bonk;
    let vaultPda;
    let bumpVaultPda;

    async function tokenSetup() {
      console.log('\nSPL setup for clean vault');

      await _provider.connection.confirmTransaction(
        await _provider.connection.requestAirdrop(
          bonk_auth.publicKey,
          2 * LAMPORTS_PER_SOL
        )
      );
      await _provider.connection.confirmTransaction(
        await _provider.connection.requestAirdrop(
          PaYeR.publicKey,
          2 * LAMPORTS_PER_SOL
        )
      );
      await _provider.connection.confirmTransaction(
        await _provider.connection.requestAirdrop(
          vaultOwner.publicKey,
          2 * LAMPORTS_PER_SOL
        )
      );
      await _provider.connection.confirmTransaction(
        await _provider.connection.requestAirdrop(
          recipient.publicKey,
          2 * LAMPORTS_PER_SOL
        )
      );
      console.log('SOL airdrops done');

      [vaultPda, bumpVaultPda] = await PublicKey.findProgramAddress(
        [
          Buffer.from('vault'),
          bank.publicKey.toBytes(),
          vaultCreator.publicKey.toBytes(),
        ],
        GEM_BANK_PROG_ID
      );

      // bonk set-up
      bonkToken = await Token.createMint(
        _provider.connection,
        PaYeR,
        bonk_auth.publicKey,
        bonk_auth.publicKey,
        4,
        TOKEN_PROGRAM_ID
      );

      // Create destination ATAs for bonk and fake bonk
      recipientAta_bonk = await bonkToken.getOrCreateAssociatedAccountInfo(
        recipient.publicKey
      );
      // Derive ATA of the bonk for recipient
      [vaultAta_bonk] = await PublicKey.findProgramAddress(
        [
          vault.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          bonkToken.publicKey.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            PaYeR.publicKey,
            vaultAta_bonk,
            vault,
            bonkToken.publicKey
          )
        );

        const blockHash = await _provider.connection.getRecentBlockhash();
        // transaction.feePayer = PaYeR.secretKey;
        transaction.recentBlockhash = await blockHash.blockhash;
        await _provider.sendAndConfirm(transaction, [PaYeR]);
      } catch (error: unknown) {
        console.log(error);
        console.log('\n\n\n');
      }

      await bonkToken.mintTo(recipientAta_bonk.address, bonk_auth, [], 10); // Top-up recipient with bonk
      await bonkToken.mintTo(vaultAta_bonk, bonk_auth, [], 9); // Top-up vault recipient with bonk
      console.log('Bonk top up done');

      // fake bonk set-up
      fakeBonkToken = await Token.createMint(
        _provider.connection,
        PaYeR,
        fake_bonk_auth.publicKey,
        fake_bonk_auth.publicKey,
        4,
        TOKEN_PROGRAM_ID
      );
      // Destination ATA for fake bonk
      recipientAta_fake_bonk =
        await fakeBonkToken.getOrCreateAssociatedAccountInfo(
          recipient.publicKey
        );
      // Derive ATA of the fake bonk for recipient
      [vaultAta_fake_bonk] = await PublicKey.findProgramAddress(
        [
          vault.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          fakeBonkToken.publicKey.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      try {
        const transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            PaYeR.publicKey,
            vaultAta_fake_bonk,
            vault,
            fakeBonkToken.publicKey
          )
        );

        const blockHash = await _provider.connection.getRecentBlockhash();
        // transaction.feePayer = PaYeR.secretKey;
        transaction.recentBlockhash = await blockHash.blockhash;
        await _provider.sendAndConfirm(transaction, [PaYeR]);
      } catch (error: unknown) {
        console.log(error);
        console.log('\n\n\n');
      }
      await fakeBonkToken.mintTo(vaultAta_fake_bonk, fake_bonk_auth, [], 22);
      await fakeBonkToken.mintTo(
        recipientAta_fake_bonk.address,
        fake_bonk_auth,
        [],
        10
      );
      console.log('Fake bonk top up done');
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

    it("can't withdraw other users bonk", async () => {
      let vaultAuth;
      ({ vaultAuth, gemBox, GDR } = await prepDeposit(vaultOwner));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));

      await tokenSetup();

      const [authtPda, bumpAuthPda] = await PublicKey.findProgramAddress(
        [vault.toBytes()],
        GEM_BANK_PROG_ID
      );

      let randomDude: Keypair = Keypair.generate();
      try {
        let tr = await gb.cleanVault(
          randomDude,
          vaultAta_bonk,
          vault,
          recipientAta_bonk.address,
          bonkToken.publicKey,
          bank.publicKey,
          vaultAuth,
          bumpAuthPda
        );
        assert(false);
      } catch {}
    });

    it('Bonk SPL withdrawl after airdrop (caller has deposit)', async () => {
      let vaultAuth;
      ({ vaultAuth, gemBox, GDR } = await prepDeposit(vaultOwner));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));

      await tokenSetup();

      const [authtPda, bumpAuthPda] = await PublicKey.findProgramAddress(
        [vault.toBytes()],
        GEM_BANK_PROG_ID
      );

      let vaultBonkStart = Number(
        (await bonkToken.getAccountInfo(vaultAta_bonk)).amount
      );

      let recipientBonkStart = Number(
        (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
      );

      let vaultFakeBonkStart = Number(
        (await fakeBonkToken.getAccountInfo(vaultAta_fake_bonk)).amount
      );

      let recipientFakeBonkStart = Number(
        (await fakeBonkToken.getAccountInfo(recipientAta_fake_bonk.address))
          .amount
      );

      console.log('[BONK] Vault balance start:', vaultBonkStart);
      console.log('[BONK] Recipient balance start:', recipientBonkStart);
      console.log('[FBNK] Vault balance start:', vaultFakeBonkStart);
      console.log('[FBNK] Recipient balance start:', recipientFakeBonkStart);

      await gb.cleanVault(
        vaultOwner,
        vaultAta_bonk,
        vault,
        recipientAta_bonk.address,
        bonkToken.publicKey,
        bank.publicKey,
        vaultAuth,
        bumpAuthPda
      );

      let vaultBonkEnd = Number(
        (await bonkToken.getAccountInfo(vaultAta_bonk)).amount
      );

      let recipientBonkEnd = Number(
        (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
      );

      let vaultFakeBonkEnd = Number(
        (await fakeBonkToken.getAccountInfo(vaultAta_fake_bonk)).amount
      );

      let recipientFakeBonkEnd = Number(
        (await fakeBonkToken.getAccountInfo(recipientAta_fake_bonk.address))
          .amount
      );

      console.log('\n[BONK] Vault balance after clean:', vaultBonkEnd);
      console.log('[FBNK] Vault balance after clean:', vaultFakeBonkEnd);
      console.log('[BONK] Recipient balance after clean:', recipientBonkEnd);
      console.log(
        '[FBNK] Recipient balance after clean:',
        recipientFakeBonkEnd
      );

      // No change to fake bonk balance for recipient
      assert.equal(recipientFakeBonkEnd, recipientFakeBonkStart);
      // No change to fake bonk balance for the vault
      assert.equal(vaultFakeBonkEnd, vaultFakeBonkStart);
      // Transfered all the bonk from the vault to the recipient
      assert.equal(vaultBonkStart, recipientBonkEnd - recipientBonkStart);
    });

    it('Fake bonk SPL withdrawl after airdrop (caller has deposit)', async () => {
      let vaultAuth;
      ({ vaultAuth, gemBox, GDR } = await prepDeposit(vaultOwner));

      const gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));

      await tokenSetup();

      const [authtPda, bumpAuthPda] = await PublicKey.findProgramAddress(
        [vault.toBytes()],
        GEM_BANK_PROG_ID
      );

      let vaultBonkStart = Number(
        (await bonkToken.getAccountInfo(vaultAta_bonk)).amount
      );

      let recipientBonkStart = Number(
        (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
      );

      let vaultFakeBonkStart = Number(
        (await fakeBonkToken.getAccountInfo(vaultAta_fake_bonk)).amount
      );

      let recipientFakeBonkStart = Number(
        (await fakeBonkToken.getAccountInfo(recipientAta_fake_bonk.address))
          .amount
      );

      console.log('[BONK] Vault balance start:', vaultBonkStart);
      console.log('[BONK] Recipient balance start:', recipientBonkStart);
      console.log('[FBNK] Vault balance start:', vaultFakeBonkStart);
      console.log('[FBNK] Recipient balance start:', recipientFakeBonkStart);

      await gb.cleanVault(
        vaultOwner,
        vaultAta_fake_bonk,
        vault,
        recipientAta_fake_bonk.address,
        fakeBonkToken.publicKey,
        bank.publicKey,
        vaultAuth,
        bumpAuthPda
      );

      let vaultBonkEnd = Number(
        (await bonkToken.getAccountInfo(vaultAta_bonk)).amount
      );

      let recipientBonkEnd = Number(
        (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
      );

      let vaultFakeBonkEnd = Number(
        (await fakeBonkToken.getAccountInfo(vaultAta_fake_bonk)).amount
      );

      let recipientFakeBonkEnd = Number(
        (await fakeBonkToken.getAccountInfo(recipientAta_fake_bonk.address))
          .amount
      );

      console.log('\n[BONK] Vault balance after clean:', vaultBonkEnd);
      console.log('[FBNK] Vault balance after clean:', vaultFakeBonkEnd);
      console.log('[BONK] Recipient balance after clean:', recipientBonkEnd);
      console.log(
        '[FBNK] Recipient balance after clean:',
        recipientFakeBonkEnd
      );

      // No change to bonk balance for recipient
      assert.equal(recipientBonkEnd, recipientBonkStart);
      // No change to bonk balance for the vault
      assert.equal(vaultBonkEnd, vaultBonkStart);
      // Transfered all the bonk from the vault to the recipient
      assert.equal(
        vaultFakeBonkStart,
        recipientFakeBonkEnd - recipientFakeBonkStart
      );
    });
  });
});
