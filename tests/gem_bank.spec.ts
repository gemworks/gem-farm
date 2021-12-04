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
import { u64 } from '@solana/spl-token';
import { BankFlags } from './utils/bank';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const { BN } = anchor;

describe('gem bank', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GemBank as Program<GemBank>;

  const testUtils = new AccountUtils(
    provider.connection,
    provider.wallet as anchor.Wallet
  );

  //bank
  const bankKp = Keypair.generate();
  let managerKp: Keypair;

  //vault
  let vaultCreatorPk: Keypair;
  let vaultAuthorityPk: Keypair;
  let vaultPk: PublicKey;
  let vaultId: anchor.BN;

  before('configures accounts', async () => {
    managerKp = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultCreatorPk = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultAuthorityPk = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
  });

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
    vaultId = bankAcc.vaultCount.add(new BN(1));
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

  it('fails to set bank flags w/ wrong manager', async () => {
    const flags = new u64(BankFlags.FreezeAllVaults);

    await expect(
      program.rpc.setBankFlags(flags, {
        accounts: {
          bank: bankKp.publicKey,
          manager: provider.wallet.publicKey,
        },
        signers: [],
      })
    ).to.be.rejectedWith('has_one');
  });

  // --------------------------------------- vault

  it('inits vault', async () => {
    let bump: number;
    [vaultPk, bump] = await testUtils.findProgramAddress(program.programId, [
      'vault',
      bankKp.publicKey,
      vaultId.toBuffer('le', 8),
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
    await program.rpc.updateVaultAuthority(vaultAuthorityPk.publicKey, {
      accounts: {
        vault: vaultPk,
        authority: vaultCreatorPk.publicKey,
      },
      signers: [vaultCreatorPk],
    });

    console.log('vault authority updated');
  });

  it('fails to update vault authority w/ wrong existing authority', async () => {
    await expect(
      program.rpc.updateVaultAuthority(vaultAuthorityPk.publicKey, {
        accounts: {
          vault: vaultPk,
          authority: provider.wallet.publicKey,
        },
        signers: [],
      })
    ).to.be.rejectedWith('has_one');

    console.log('vault authority updated');
  });
});
