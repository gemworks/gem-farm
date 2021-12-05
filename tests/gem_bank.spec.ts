import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { GemBank } from '../target/types/gem_bank';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { AccountUtils, ITokenData } from './utils/account';
import {
  AccountInfo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import { BankFlags } from './utils/bank';
import chai, { assert, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { toBase58 } from './utils/types';

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
  let vaultOwner1Pk: Keypair;
  let vaultOwner2Pk: Keypair;
  let vaultPk: PublicKey;
  let vaultAuthPk: PublicKey;

  //gem box
  let gemOwnerKp: Keypair;
  let gemBoxPk: PublicKey;
  const amount = new BN(Math.ceil(Math.random() * 100));
  let gem: ITokenData;

  before('configures accounts', async () => {
    someRandomKp = await accUtils.createWallet(100 * LAMPORTS_PER_SOL);

    managerKp = await accUtils.createWallet(100 * LAMPORTS_PER_SOL);

    vaultOwner1Pk = await accUtils.createWallet(100 * LAMPORTS_PER_SOL);
    vaultOwner2Pk = await accUtils.createWallet(100 * LAMPORTS_PER_SOL);

    gemOwnerKp = await accUtils.createWallet(100 * LAMPORTS_PER_SOL);
    gem = await accUtils.createMintAndATA(gemOwnerKp.publicKey, amount);
  });

  // --------------------------------------- helpers

  async function getBankState(bankPk: PublicKey) {
    return program.account.bank.fetch(bankPk);
  }

  async function getVaultState(vaultPk: PublicKey) {
    return program.account.vault.fetch(vaultPk);
  }

  async function getGemAccState(
    mintPk: PublicKey,
    gemAcc: PublicKey
  ): Promise<AccountInfo> {
    return accUtils.deserializeTokenAccount(mintPk, gemAcc);
  }

  async function getVaultPDA(bankPk: PublicKey) {
    const nextVaultId = (await getBankState(bankPk)).vaultCount.add(new BN(1));
    return accUtils.findProgramAddress(program.programId, [
      'vault',
      bankPk,
      nextVaultId.toBuffer('le', 8),
    ]);
  }

  async function getGemBoxPDA(vaultPk: PublicKey) {
    const nextGemBoxId = (await getVaultState(vaultPk)).gemBoxCount.add(
      new BN(1)
    );
    return accUtils.findProgramAddress(program.programId, [
      'gem_box',
      vaultPk,
      nextGemBoxId.toBuffer('le', 8),
    ]);
  }

  async function getVaultAuthorityPDA(vaultPk: PublicKey) {
    return accUtils.findProgramAddress(program.programId, [vaultPk]);
  }

  function printAccounts() {
    console.log('someRandomKp', someRandomKp.publicKey.toBase58());

    console.log('bankKp', bankKp.publicKey.toBase58());
    console.log('managerKp', managerKp.publicKey.toBase58());

    console.log('vaultOwner1Pk', vaultOwner1Pk.publicKey.toBase58());
    console.log('vaultOwner2Pk', vaultOwner2Pk.publicKey.toBase58());
    console.log('vaultPk', vaultPk.toBase58());
    console.log('vaultAuthPk', vaultAuthPk.toBase58());

    console.log('gemOwnerKp', gemOwnerKp.publicKey.toBase58());
    console.log('gemBoxPk', gemBoxPk.toBase58());
    console.log('gem', toBase58(gem as any));
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

    const bankAcc = await getBankState(bankKp.publicKey);
    assert.equal(bankAcc.manager.toBase58(), managerKp.publicKey.toBase58());
    assert(bankAcc.vaultCount.eq(new BN(0)));
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

    const bankAcc = await getBankState(bankKp.publicKey);
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
    let bump;
    [vaultPk, bump] = await getVaultPDA(bankKp.publicKey);
    await program.rpc.initVault(bump, vaultOwner1Pk.publicKey, {
      accounts: {
        vault: vaultPk,
        payer: vaultOwner1Pk.publicKey,
        bank: bankKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [vaultOwner1Pk],
    });

    const bankAcc = await getBankState(bankKp.publicKey);
    const vaultAcc = await getVaultState(vaultPk);
    assert(bankAcc.vaultCount.eq(new BN(1)));
    assert(vaultAcc.vaultId.eq(new BN(1)));
    assert.equal(vaultAcc.owner.toBase58, vaultOwner1Pk.publicKey.toBase58);
  });

  it('updates vault owner', async () => {
    await program.rpc.updateVaultOwner(vaultOwner2Pk.publicKey, {
      accounts: {
        vault: vaultPk,
        owner: vaultOwner1Pk.publicKey,
      },
      signers: [vaultOwner1Pk],
    });

    const vaultAcc = await getVaultState(vaultPk);
    assert.equal(vaultAcc.owner.toBase58, vaultOwner2Pk.publicKey.toBase58);
  });

  it('FAILS to update vault owner w/ wrong existing owner', async () => {
    await expect(
      program.rpc.updateVaultOwner(vaultOwner2Pk.publicKey, {
        accounts: {
          vault: vaultPk,
          owner: someRandomKp.publicKey,
        },
        signers: [someRandomKp],
      })
    ).to.be.rejectedWith('has_one');
  });

  // --------------------------------------- gem boxes

  //this is re-used a few times, so made sense to extract
  async function makeDeposit() {
    let bump: number;
    [vaultAuthPk, bump] = await getVaultAuthorityPDA(vaultPk);
    [gemBoxPk, bump] = await getGemBoxPDA(vaultPk);
    await program.rpc.depositGem(bump, amount, {
      accounts: {
        vault: vaultPk,
        owner: vaultOwner2Pk.publicKey,
        authority: vaultAuthPk,
        gemBox: gemBoxPk,
        gemSource: gem.tokenAcc,
        gemMint: gem.tokenMint,
        depositor: gemOwnerKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [vaultOwner2Pk, gemOwnerKp],
    });
  }

  it('deposits gem', async () => {
    await makeDeposit();

    const vault = await getVaultState(vaultPk);
    assert(vault.gemBoxCount.eq(new BN(1)));
    const gemBox = await getGemAccState(gem.tokenMint, gemBoxPk);
    assert(gemBox.amount.eq(amount));
    assert.equal(gemBox.mint.toBase58(), gem.tokenMint.toBase58());
    assert.equal(gemBox.owner.toBase58(), vaultAuthPk.toBase58());
  });

  it('FAILS to deposit gem w/ wrong authority', async () => {
    const [vaultAuthPk2, bump] = await getVaultAuthorityPDA(vaultPk);
    const [gemBoxPk2, bump2] = await getGemBoxPDA(vaultPk);
    await expect(
      program.rpc.depositGem(bump2, amount, {
        accounts: {
          vault: vaultPk,
          owner: someRandomKp.publicKey,
          authority: vaultAuthPk2,
          gemBox: gemBoxPk2,
          gemSource: gem.tokenAcc,
          gemMint: gem.tokenMint,
          depositor: gemOwnerKp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [someRandomKp, gemOwnerKp],
      })
    ).to.be.rejectedWith('has_one');
  });

  it('withdraws gem to existing ATA', async () => {
    await program.rpc.withdrawGem(amount, {
      accounts: {
        vault: vaultPk,
        owner: vaultOwner2Pk.publicKey,
        authority: vaultAuthPk,
        gemBox: gemBoxPk,
        gemDestination: gem.tokenAcc,
        gemMint: gem.tokenMint,
        receiver: gemOwnerKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [vaultOwner2Pk],
    });

    const gemBox = await getGemAccState(gem.tokenMint, gemBoxPk);
    assert(gemBox.amount.eq(new BN(0)));
    const gemAcc = await getGemAccState(gem.tokenMint, gem.tokenAcc);
    assert(gemAcc.amount.eq(amount));
  });

  it('withdraws gem to missing ATA', async () => {
    //need another deposit
    await makeDeposit();

    const missingATA = await accUtils.getATA(
      gem.tokenMint,
      someRandomKp.publicKey
    );
    await program.rpc.withdrawGem(amount, {
      accounts: {
        vault: vaultPk,
        owner: vaultOwner2Pk.publicKey,
        authority: vaultAuthPk,
        gemBox: gemBoxPk,
        gemDestination: missingATA,
        gemMint: gem.tokenMint,
        receiver: someRandomKp.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [vaultOwner2Pk],
    });

    const gemBox = await getGemAccState(gem.tokenMint, gemBoxPk);
    assert(gemBox.amount.eq(new BN(0)));
    const gemAcc = await getGemAccState(gem.tokenMint, missingATA);
    assert(gemAcc.amount.eq(amount));
  });
});
