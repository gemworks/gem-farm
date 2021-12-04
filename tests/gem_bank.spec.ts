import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { GemBank } from '../target/types/gem_bank';
import assert from 'assert';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { AccountUtils } from './utils/account';
import { u64 } from '@solana/spl-token';
import { BankFlags } from './utils/bank';

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
  let vaultOwnerKp: Keypair;
  let vaultPk: PublicKey;
  let vaultId: anchor.BN;

  before('configures accounts', async () => {
    managerKp = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultOwnerKp = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
  });

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

  it('inits vault', async () => {
    let bump: number;
    [vaultPk, bump] = await testUtils.findProgramAddress(program.programId, [
      'vault',
      bankKp.publicKey,
      vaultId.toBuffer('le', 8),
    ]);
    await program.rpc.initVault(bump, {
      accounts: {
        vault: vaultPk,
        owner: vaultOwnerKp.publicKey,
        bank: bankKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [vaultOwnerKp],
    });

    const bankAcc = await program.account.bank.fetch(bankKp.publicKey);
    const vaultAcc = await program.account.vault.fetch(vaultPk);
    assert(bankAcc.vaultCount.eq(new BN(1)));
    assert(vaultAcc.vaultId.eq(new BN(1)));

    console.log('vault live');
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
});
