import * as anchor from '@project-serum/anchor';
import {AnchorProvider, BN} from '@project-serum/anchor';
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
  findVaultAuthorityPDA,
  GemBankClient, isKp,
  ITokenData,
  NodeWallet, stringifyPKsAndBNs,
  stringToBytes,
} from '../../src';
import chai, {assert, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {describe} from 'mocha';
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

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
    {pubkey: payer, isSigner: true, isWritable: true},
    {pubkey: associatedToken, isSigner: false, isWritable: true},
    {pubkey: owner, isSigner: false, isWritable: false},
    {pubkey: mint, isSigner: false, isWritable: false},
    {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
    {pubkey: programId, isSigner: false, isWritable: false},
    {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
  ];

  return new TransactionInstruction({
    keys,
    programId: associatedTokenProgramId,
    data: Buffer.alloc(0),
  });
}

describe('Withdraw tokens owned by authority', () => {
  const _provider = AnchorProvider.local();
  const gb = new GemBankClient(_provider.connection, _provider.wallet as any);
  const nw = new NodeWallet(_provider.connection, _provider.wallet as any);

  // --------------------------------------- bank + vault
  //global state
  let bank: Keypair;
  let bankManager: Keypair;
  let vaultOwner: Keypair;
  let vaultAuth: PublicKey;
  let vault: PublicKey;
  let bonkAuth: Keypair;

  let gemAmount: anchor.BN;
  let gem: ITokenData;
  let gemBox: PublicKey;

  let bonkToken: Token;
  let recipientAta_bonk;
  let authAta;

  beforeEach('configures accounts', async () => {
    bank = Keypair.generate();
    bankManager = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    vaultOwner = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);
    bonkAuth = await nw.createFundedWallet(100 * LAMPORTS_PER_SOL);

    //init bank
    await gb.initBank(bank, bankManager, bankManager);

    let bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert.equal(
      bankAcc.bankManager.toBase58(),
      bankManager.publicKey.toBase58()
    );
    assert(bankAcc.vaultCount.eq(new BN(0)));

    //init vault
    ({vault} = await gb.initVault(
      bank.publicKey,
      vaultOwner,
      vaultOwner,
      vaultOwner.publicKey,
      'test_vault'
    ));

    bankAcc = await gb.fetchBankAcc(bank.publicKey);
    assert(bankAcc.vaultCount.eq(new BN(1)));

    const vaultAcc = await gb.fetchVaultAcc(vault);
    expect(vaultAcc.name).to.deep.include.members(stringToBytes('test_vault'));
    assert.equal(vaultAcc.bank.toBase58(), bank.publicKey.toBase58());
    assert.equal(vaultAcc.owner.toBase58(), vaultOwner.publicKey.toBase58());
    assert.equal(
      vaultAcc.creator.toBase58(),
      vaultOwner.publicKey.toBase58()
    );

    //prep gem
    ({gemAmount, gem} = await prepGem(vaultOwner));

    // bonk set-up
    bonkToken = await Token.createMint(
      _provider.connection,
      bonkAuth,
      bonkAuth.publicKey,
      bonkAuth.publicKey,
      4,
      TOKEN_PROGRAM_ID
    );

    // Bonk recipient ATA
    recipientAta_bonk = await bonkToken.getOrCreateAssociatedAccountInfo(
      vaultOwner.publicKey
    );

    // Bonk ATA controlled by gem farm
    [vaultAuth] = await findVaultAuthorityPDA(vault);
    authAta = await gb.findATA(bonkToken.publicKey, vaultAuth);

    const transaction = new Transaction({
      feePayer: bonkAuth.publicKey,
      recentBlockhash: (await _provider.connection.getRecentBlockhash()).blockhash
    }).add(
      createAssociatedTokenAccountInstruction(
        bonkAuth.publicKey,
        authAta,
        vaultAuth,
        bonkToken.publicKey
      )
    );
    await _provider.sendAndConfirm(transaction, [bonkAuth]);
    await bonkToken.mintTo(authAta, bonkAuth, [], 9); // Top-up vault recipient with bonk
    console.log('Bonk top up done');
  });

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

    return {gemAmount, gemOwner, gem};
  }

  it('withdraws bonk (no gems)', async () => {
    let vaultBonkStart = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkStart = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkStart).to.be.gt(0);
    expect(recipientBonkStart).to.eq(0);

    const {builder} = await gb.withdrawTokensAuth(
      bank.publicKey,
      vault,
      vaultOwner,
      bonkToken.publicKey,
    );
    await builder.rpc();

    let vaultBonkEnd = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkEnd = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkEnd).to.eq(0);
    expect(recipientBonkEnd).to.eq(vaultBonkStart);
  });

  it('withdraws bonk (gems present)', async () => {
    ({vaultAuth, gemBox} = await prepDeposit(vaultOwner));
    let gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
    assert(gemBoxAcc.amount.eq(gemAmount));

    let vaultBonkStart = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkStart = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkStart).to.be.gt(0);
    expect(recipientBonkStart).to.eq(0);

    const {builder} = await gb.withdrawTokensAuth(
      bank.publicKey,
      vault,
      vaultOwner,
      bonkToken.publicKey,
    );
    await builder.rpc();

    let vaultBonkEnd = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkEnd = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkEnd).to.eq(0);
    expect(recipientBonkEnd).to.eq(vaultBonkStart);

    gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
    assert(gemBoxAcc.amount.eq(gemAmount));
  });

  it('fails to withdraw actual gems', async () => {
    ({vaultAuth, gemBox} = await prepDeposit(vaultOwner));
    let gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
    assert(gemBoxAcc.amount.eq(gemAmount));

    let vaultBonkStart = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkStart = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkStart).to.be.gt(0);
    expect(recipientBonkStart).to.eq(0);

    //manually build a malicious ix
    const maliciousMint = gem.tokenMint;
    const maliciousRecipient = await gb.findATA(
      maliciousMint,
      vaultOwner.publicKey,
    );
    const builder = gb.bankProgram.methods
      .withdrawTokensAuth()
      .accounts({
        bank: bank.publicKey,
        vault,
        owner: vaultOwner.publicKey,
        authority: vaultAuth,
        recipientAta: maliciousRecipient, //<-- into own ATA
        vaultAta: gemBox, //<-- try to withdraw from gembox
        mint: maliciousMint, //<-- gem mint
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultOwner]);

    //fire off
    await expect(builder.rpc()).to.be.rejectedWith("TransferNotAllowed");

    //bonk should not have changed
    let vaultBonkEnd = Number(
      (await bonkToken.getAccountInfo(authAta)).amount
    );
    let recipientBonkEnd = Number(
      (await bonkToken.getAccountInfo(recipientAta_bonk.address)).amount
    );
    expect(vaultBonkEnd).to.eq(vaultBonkStart);
    expect(recipientBonkEnd).to.eq(0);

    gemBoxAcc = await gb.fetchGemAcc(gem.tokenMint, gemBox);
    assert(gemBoxAcc.amount.eq(gemAmount));
  });
});
