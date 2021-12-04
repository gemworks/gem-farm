import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { GemBank } from '../target/types/gem_bank';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { AccountUtils } from './utils/account';
import { AccountInfo, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import { BankFlags } from './utils/bank';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const { BN } = anchor;

describe('gem bank', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GemBank as Program<GemBank>;

  const accUtils = new AccountUtils(
    provider.connection,
    provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state

  let someRandomKp: Keypair;

  //bank
  const bankKp = Keypair.generate();
  let managerKp: Keypair;

  //vault
  let vaultCreatorPk: Keypair;
  let vaultAuthorityKp: Keypair;
  let vaultPk: PublicKey;

  //gem box
  let gemOwnerKp: Keypair;
  let gemBoxPk: PublicKey;

  before('configures accounts', async () => {
    someRandomKp = await accUtils.createWallet(10 * LAMPORTS_PER_SOL);
    managerKp = await accUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultCreatorPk = await accUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultAuthorityKp = await accUtils.createWallet(10 * LAMPORTS_PER_SOL);
    gemOwnerKp = await accUtils.createWallet(10 * LAMPORTS_PER_SOL);
  });

  // --------------------------------------- helpers

  async function getBankState() {
    return await program.account.bank.fetch(bankKp.publicKey);
  }

  async function getVaultState() {
    return await program.account.vault.fetch(vaultPk);
  }

  async function getGemBoxState(mintPk: PublicKey): Promise<AccountInfo> {
    return await accUtils.deserializeTokenAccount(mintPk, gemBoxPk);
  }

  // --------------------------------------- bank

  it('inits bank', async () => {
    await program.rpc.initBank({
      accounts: {
        bank: bankKp.publicKey,
        manager: managerKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [managerKp, bankKp],
    });

    const bankAcc = await program.account.bank.fetch(bankKp.publicKey);
    assert.equal(bankAcc.manager.toBase58(), managerKp.publicKey.toBase58());
    assert(bankAcc.vaultCount.eq(new BN(0)));

    console.log('bank live');
  });

  it('sets bank flags', async () => {
    const flags = new u64(BankFlags.FreezeAllVaults);
    await program.rpc.setBankFlags(flags, {
      accounts: {
        bank: bankKp.publicKey,
        manager: managerKp.publicKey,
      },
      signers: [managerKp],
    });

    const bankAcc = await program.account.bank.fetch(bankKp.publicKey);
    assert(bankAcc.flags.eq(new u64(BankFlags.FreezeAllVaults)));
  });

  it('FAILS to set bank flags w/ wrong manager', async () => {
    const flags = new u64(BankFlags.FreezeAllVaults);

    await expect(
      program.rpc.setBankFlags(flags, {
        accounts: {
          bank: bankKp.publicKey,
          manager: someRandomKp.publicKey,
        },
        signers: [someRandomKp],
      })
    ).to.be.rejectedWith('has_one');
  });

  // --------------------------------------- vault

  it('inits vault', async () => {
    const nextVaultId = (await getBankState()).vaultCount.add(new BN(1));
    let bump: number;
    [vaultPk, bump] = await accUtils.findProgramAddress(program.programId, [
      'vault',
      bankKp.publicKey,
      nextVaultId.toBuffer('le', 8),
    ]);
    await program.rpc.initVault(bump, vaultCreatorPk.publicKey, {
      accounts: {
        vault: vaultPk,
        payer: vaultCreatorPk.publicKey,
        bank: bankKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [vaultCreatorPk],
    });

    const bankAcc = await program.account.bank.fetch(bankKp.publicKey);
    const vaultAcc = await program.account.vault.fetch(vaultPk);
    assert(bankAcc.vaultCount.eq(new BN(1)));
    assert(vaultAcc.vaultId.eq(new BN(1)));

    console.log('vault live');
  });

  it('updates vault authority', async () => {
    await program.rpc.updateVaultAuthority(vaultAuthorityKp.publicKey, {
      accounts: {
        vault: vaultPk,
        authority: vaultCreatorPk.publicKey,
      },
      signers: [vaultCreatorPk],
    });

    console.log('vault authority updated');
  });

  it('FAILS to update vault authority w/ wrong existing authority', async () => {
    await expect(
      program.rpc.updateVaultAuthority(vaultAuthorityKp.publicKey, {
        accounts: {
          vault: vaultPk,
          authority: someRandomKp.publicKey,
        },
        signers: [someRandomKp],
      })
    ).to.be.rejectedWith('has_one');

    console.log('vault authority updated');
  });

  // --------------------------------------- gem boxes

  it('accepts gem deposit', async () => {
    const amount = new BN(Math.floor(Math.random() * 100));
    const gem = await accUtils.createAndFundTokenAcc(
      gemOwnerKp.publicKey,
      amount
    );
    const nextGemBoxId = (await getVaultState()).gemBoxCount.add(new BN(1));
    let bump: number;
    [gemBoxPk, bump] = await accUtils.findProgramAddress(program.programId, [
      'gem_box',
      vaultPk,
      nextGemBoxId.toBuffer('le', 8),
    ]);
    await program.rpc.depositGem(bump, amount, {
      accounts: {
        vault: vaultPk,
        authority: vaultAuthorityKp.publicKey,
        gemBox: gemBoxPk,
        gemSource: gem.tokenAcc,
        gemMint: gem.tokenMint,
        depositor: gemOwnerKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [vaultAuthorityKp, gemOwnerKp],
    });
    const gemBox = await getGemBoxState(gem.tokenMint);
    assert(gemBox.amount.eq(amount));
    assert.equal(gemBox.mint.toBase58(), gem.tokenMint.toBase58());
    assert.equal(
      gemBox.owner.toBase58(),
      vaultAuthorityKp.publicKey.toBase58()
    );
  });

  it('FAILS a gem deposit w/ wrong authority', async () => {
    const amount = new BN(Math.floor(Math.random() * 100));
    const gem = await accUtils.createAndFundTokenAcc(
      gemOwnerKp.publicKey,
      amount
    );
    const nextGemBoxId = (await getVaultState()).gemBoxCount.add(new BN(1));
    let bump: number;
    [gemBoxPk, bump] = await accUtils.findProgramAddress(program.programId, [
      'gem_box',
      vaultPk,
      nextGemBoxId.toBuffer('le', 8),
    ]);
    await expect(
      program.rpc.depositGem(bump, amount, {
        accounts: {
          vault: vaultPk,
          authority: someRandomKp.publicKey,
          gemBox: gemBoxPk,
          gemSource: gem.tokenAcc,
          gemMint: gem.tokenMint,
          depositor: gemOwnerKp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [someRandomKp, gemOwnerKp],
      })
    ).to.be.rejectedWith('0x0');
  });
});
