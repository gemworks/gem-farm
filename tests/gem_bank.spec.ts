import * as anchor from '@project-serum/anchor';
import {Program} from '@project-serum/anchor';
import {GemBank} from '../target/types/gem_bank';
import assert from 'assert';
import {Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} from "@solana/web3.js";
import {AccountUtils} from "./utils/account";

const {BN} = anchor;

describe('gem bank', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GemBank as Program<GemBank>;

  const testUtils = new AccountUtils(provider.connection, provider.wallet as anchor.Wallet);

  //bank
  const bankKp = Keypair.generate();
  let keeperKp: Keypair;

  //vault
  let vaultOwnerKp: Keypair;
  let vaultPk: PublicKey;
  let vaultId: anchor.BN;

  before('configures accounts', async () => {
    keeperKp = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
    vaultOwnerKp = await testUtils.createWallet(10 * LAMPORTS_PER_SOL);
  })

  it('inits bank', async () => {
    await program.rpc.initBank({
      accounts: {
        bank: bankKp.publicKey,
        keeper: keeperKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [keeperKp, bankKp],
    });

    const bankAcc = await program.account.bank.fetch(bankKp.publicKey);
    vaultId = bankAcc.vaultCount.add(new BN(1));
    assert.equal(bankAcc.keeper.toBase58(), keeperKp.publicKey.toBase58());
    assert.equal(bankAcc.vaultCount.toNumber(), 0);

    console.log('bank live')
  });

  it('inits vault', async () => {
    let bump: number;
    [vaultPk, bump] = await testUtils.findProgramAddress(program.programId, [
      "bank",
      bankKp.publicKey,
      vaultId.toBuffer("le", 8),
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

    console.log('vault live')
  })
});
