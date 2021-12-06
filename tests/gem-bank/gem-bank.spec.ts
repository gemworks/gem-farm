import * as anchor from '@project-serum/anchor';
import { BN, Program } from '@project-serum/anchor';
import { GemBank } from '../../target/types/gem_bank';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { ITokenData } from '../utils/account';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { toBase58 } from '../utils/types';
import { BankFlags, GemBankUtils } from './gem-bank';

chai.use(chaiAsPromised);

describe('gem bank', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GemBank as Program<GemBank>;

  const gb = new GemBankUtils(provider, program);

  // --------------------------------------- state
  //used to test bad transactions with wrong account passed in
  let randomWallet: Keypair;

  //bank
  const bank = Keypair.generate();
  let manager: Keypair;

  //vault
  let vaultFounder: Keypair;
  let vaultOwner: Keypair;
  let vault: PublicKey;
  let vaultAuthority: PublicKey;

  //gem box
  let gemAmount: anchor.BN;
  let gemOwner: Keypair;
  let gem: ITokenData;
  let gemBox: PublicKey;
  let gemBump: number;
  let GDR: PublicKey;
  let GDRBump: number;

  function printState() {
    console.log('randomWallet', randomWallet.publicKey.toBase58());

    console.log('bank', bank.publicKey.toBase58());
    console.log('manager', manager.publicKey.toBase58());

    console.log('vaultFounder', vaultFounder.publicKey.toBase58());
    console.log('vaultOwner', vaultOwner.publicKey.toBase58());
    console.log('vault', vault.toBase58());
    console.log('vaultAuth', vaultAuthority.toBase58());

    console.log('amount', gemAmount.toString());
    console.log('gemOwner', gemOwner.publicKey.toBase58());
    console.log('gem', toBase58(gem as any));
    console.log('gemBox', gemBox.toBase58());
    console.log('GDR', GDR.toBase58());
  }

  before('configures accounts', async () => {
    randomWallet = await gb.createWallet(100 * LAMPORTS_PER_SOL);

    manager = await gb.createWallet(100 * LAMPORTS_PER_SOL);

    vaultFounder = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    vaultOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
  });

  // --------------------------------------- bank

  it('inits bank', async () => {
    await program.rpc.initBank({
      accounts: {
        bank: bank.publicKey,
        manager: manager.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [manager, bank],
    });

    const bankAcc = await gb.getBankAcc(bank.publicKey);
    assert.equal(bankAcc.manager.toBase58(), manager.publicKey.toBase58());
    assert(bankAcc.vaultCount.eq(new BN(0)));
  });

  // --------------------------------------- vault

  async function updateVaultOwner(existingOwner: Keypair, newOwner: PublicKey) {
    await program.rpc.updateVaultOwner(newOwner, {
      accounts: {
        bank: bank.publicKey,
        vault: vault,
        owner: existingOwner.publicKey,
      },
      signers: [existingOwner],
    });
  }

  it('inits vault', async () => {
    let bump;
    [vault, bump] = await gb.getVaultPDA(
      bank.publicKey,
      vaultFounder.publicKey
    );
    [vaultAuthority] = await gb.getVaultAuthorityPDA(vault);
    //intentionally setting founder as owner, so that we can change later
    await program.rpc.initVault(bump, vaultFounder.publicKey, {
      accounts: {
        bank: bank.publicKey,
        vault: vault,
        founder: vaultFounder.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [vaultFounder],
    });

    const bankAcc = await gb.getBankAcc(bank.publicKey);
    const vaultAcc = await gb.getVaultAcc(vault);
    assert(bankAcc.vaultCount.eq(new BN(1)));
    assert.equal(vaultAcc.bank.toBase58, bank.publicKey.toBase58);
    assert.equal(vaultAcc.owner.toBase58, vaultFounder.publicKey.toBase58);
  });

  it('updates vault owner', async () => {
    await updateVaultOwner(vaultFounder, vaultOwner.publicKey);

    const vaultAcc = await gb.getVaultAcc(vault);
    assert.equal(vaultAcc.owner.toBase58, vaultOwner.publicKey.toBase58);
  });

  it('FAILS to update vault owner w/ wrong existing owner', async () => {
    await expect(
      updateVaultOwner(randomWallet, vaultOwner.publicKey)
    ).to.be.rejectedWith('has_one');
  });

  // --------------------------------------- gem boxes

  describe('gem boxes', () => {
    async function makeDeposit(owner: Keypair) {
      await program.rpc.depositGem(gemBump, GDRBump, gemAmount, {
        accounts: {
          bank: bank.publicKey,
          vault: vault,
          owner: owner.publicKey,
          authority: vaultAuthority,
          gemBox: gemBox,
          gemDepositReceipt: GDR,
          gemSource: gem.tokenAcc,
          gemMint: gem.tokenMint,
          depositor: gemOwner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [owner, gemOwner],
      });
    }

    async function makeWithdrawal(
      owner: Keypair,
      destinationAcc: PublicKey,
      receiver: PublicKey
    ) {
      await program.rpc.withdrawGem(gemAmount, {
        accounts: {
          bank: bank.publicKey,
          vault: vault,
          owner: owner.publicKey,
          authority: vaultAuthority,
          gemBox: gemBox,
          gemDepositReceipt: GDR,
          gemDestination: destinationAcc,
          gemMint: gem.tokenMint,
          receiver: receiver,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [owner],
      });
    }

    beforeEach('creates a fresh gem', async () => {
      //create a fresh gem owner + gem & mint a random amount
      gemAmount = new BN(Math.ceil(Math.random() * 100));
      gemOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
      gem = await gb.createMintAndATA(gemOwner.publicKey, gemAmount);

      //get the next gem box / gdr
      [gemBox, gemBump] = await gb.getGemBoxPDA(vault, gem.tokenMint);
      [GDR, GDRBump] = await gb.getGdrPDA(vault, gem.tokenMint);
    });

    it('deposits gem', async () => {
      await makeDeposit(vaultOwner);

      const vaultAcc = await gb.getVaultAcc(vault);
      assert(vaultAcc.gemBoxCount.eq(new BN(1)));
      const gemBoxAcc = await gb.getGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(gemAmount));
      assert.equal(gemBoxAcc.mint.toBase58(), gem.tokenMint.toBase58());
      assert.equal(gemBoxAcc.owner.toBase58(), vaultAuthority.toBase58());

      printState();
      const GDRAcc = await gb.getGDRAcc(GDR);
      assert.equal(GDRAcc.vault.toBase58(), vault.toBase58());
      assert.equal(GDRAcc.gemBoxAddress.toBase58(), gemBox.toBase58());
      assert.equal(GDRAcc.gemMint.toBase58(), gem.tokenMint.toBase58());
      assert(GDRAcc.gemAmount.eq(gemAmount));
    });

    it('FAILS to deposit gem w/ wrong owner', async () => {
      await expect(makeDeposit(randomWallet)).to.be.rejectedWith('has_one');
    });

    it('withdraws gem to existing ATA', async () => {
      //make a fresh deposit
      await makeDeposit(vaultOwner);
      await makeWithdrawal(vaultOwner, gem.tokenAcc, gem.owner);

      const gemBoxAcc = await gb.getGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(new BN(0)));
      const gemAcc = await gb.getGemAcc(gem.tokenMint, gem.tokenAcc);
      assert(gemAcc.amount.eq(gemAmount));
      const GDRAcc = await gb.getGDRAcc(GDR);
      assert(GDRAcc.gemAmount.eq(new BN(0)));
    });

    it('withdraws gem to missing ATA', async () => {
      //make a fresh deposit
      await makeDeposit(vaultOwner);

      const missingATA = await gb.getATA(gem.tokenMint, randomWallet.publicKey);
      await makeWithdrawal(vaultOwner, missingATA, randomWallet.publicKey);

      const gemBoxAcc = await gb.getGemAcc(gem.tokenMint, gemBox);
      assert(gemBoxAcc.amount.eq(new BN(0)));
      const gemAcc = await gb.getGemAcc(gem.tokenMint, missingATA);
      assert(gemAcc.amount.eq(gemAmount));
    });

    it('FAILS to withdraw gem w/ wrong owner', async () => {
      //make a fresh deposit
      await makeDeposit(vaultOwner);

      await expect(
        makeWithdrawal(randomWallet, gem.tokenAcc, gem.owner)
      ).to.be.rejectedWith('has_one');
    });

    // --------------------------------------- vault lock

    async function setVaultLock(vaultLocked: boolean) {
      await program.rpc.setVaultLock(vaultLocked, {
        accounts: {
          bank: bank.publicKey,
          vault: vault,
          owner: vaultOwner.publicKey,
        },
        signers: [vaultOwner],
      });
    }

    it('un/locks vault successfully', async () => {
      //lock the vault
      await setVaultLock(true);
      let vaultAcc = await gb.getVaultAcc(vault);
      assert.equal(vaultAcc.locked, true);
      //deposit should fail
      await expect(makeDeposit(vaultOwner)).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );

      //unlock the vault
      await setVaultLock(false);
      vaultAcc = await gb.getVaultAcc(vault);
      assert.equal(vaultAcc.locked, false);
      //make a real deposit, we need this to try to withdraw later
      await makeDeposit(vaultOwner);

      //lock the vault
      await setVaultLock(true);
      //withdraw should fail
      await expect(
        makeWithdrawal(vaultOwner, gem.tokenAcc, gem.owner)
      ).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );

      //finally unlock the vault
      await setVaultLock(false);
      //should be able to withdraw
      await makeWithdrawal(vaultOwner, gem.tokenAcc, gem.owner);
    });

    // --------------------------------------- bank flags

    async function setBankFlags(flags: number, bankManager?: Keypair) {
      await program.rpc.setBankFlags(new u64(flags), {
        accounts: {
          bank: bank.publicKey,
          manager: bankManager ? bankManager.publicKey : manager.publicKey,
        },
        signers: [bankManager ?? manager],
      });
    }

    it('sets bank flags', async () => {
      //freeze vaults
      await setBankFlags(BankFlags.FreezeVaults);
      const bankAcc = await gb.getBankAcc(bank.publicKey);
      assert(bankAcc.flags.eq(new u64(BankFlags.FreezeVaults)));
      await expect(
        updateVaultOwner(vaultOwner, vaultFounder.publicKey)
      ).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );
      await expect(setVaultLock(true)).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );
      await expect(makeDeposit(vaultOwner)).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );

      //remove flags to be able to do a real deposit - else can't withdraw
      await setBankFlags(0);
      await makeDeposit(vaultOwner);

      //freeze vaults again
      await setBankFlags(BankFlags.FreezeVaults);
      await expect(
        makeWithdrawal(vaultOwner, gem.tokenAcc, gem.owner)
      ).to.be.rejectedWith(
        'vault is currently locked or frozen and cannot be accessed'
      );

      //unfreeze vault in the end
      await setBankFlags(0);
    });

    it('FAILS to set bank flags w/ wrong manager', async () => {
      await expect(
        setBankFlags(BankFlags.FreezeVaults, randomWallet)
      ).to.be.rejectedWith('has_one');
      //unfreeze vault in the end
      await setBankFlags(0);
    });
  });
});
