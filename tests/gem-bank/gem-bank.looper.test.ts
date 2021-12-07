import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { GemBankUtils } from './gem-bank';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { ITokenData } from '../utils/account';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { assert } from 'chai';

interface IGemBox {
  gem: ITokenData;
  gemBox: PublicKey;
  gemOwner: PublicKey;
}

interface IVault {
  vault: PublicKey;
  vaultOwner: Keypair;
  vaultAuth: PublicKey;
  gemBoxes: IGemBox[];
}

/*
 * The purpose of this test is to
 * 1) create A LOT of deposits and see how they work
 * 2) try to locate the appropriate PDAs, which will be used in FE
 */
describe('looper', () => {
  const provider = anchor.Provider.env();
  const gb = new GemBankUtils(
    provider.connection,
    provider.wallet as anchor.Wallet
  );

  // --------------------------------------- state
  const bank = Keypair.generate();
  let manager: Keypair;
  let vaults: IVault[] = [];

  // --------------------------------------- looper

  async function startBank() {
    manager = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    await gb.program.rpc.initBank({
      accounts: {
        bank: bank.publicKey,
        manager: manager.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [manager, bank],
    });
  }

  async function createVault() {
    const vaultOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    const [vault, bump] = await gb.findVaultPDA(
      bank.publicKey,
      vaultOwner.publicKey
    );
    const [vaultAuth] = await gb.findVaultAuthorityPDA(vault);
    await gb.program.rpc.initVault(bump, vaultOwner.publicKey, {
      accounts: {
        bank: bank.publicKey,
        vault: vault,
        creator: vaultOwner.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [vaultOwner],
    });
    vaults.push({
      vault,
      vaultOwner,
      vaultAuth,
      gemBoxes: [],
    });
  }

  async function addGem(v: IVault) {
    //create a fresh gem owner + gem & mint a random amount
    const gemAmount = new BN(Math.ceil(Math.random() * 100));
    const gemOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
    const gem = await gb.createMintAndATA(gemOwner.publicKey, gemAmount);

    //get the next gem box
    const [gemBox, gemBump] = await gb.findGemBoxPDA(v.vault, gem.tokenMint);
    const [GDR, GDRBump] = await gb.findGdrPDA(v.vault, gem.tokenMint);

    await gb.program.rpc.depositGem(gemBump, GDRBump, gemAmount, {
      accounts: {
        bank: bank.publicKey,
        vault: v.vault,
        owner: v.vaultOwner.publicKey,
        authority: v.vaultAuth,
        gemBox: gemBox,
        gemDepositReceipt: GDR,
        gemSource: gem.tokenAcc,
        gemMint: gem.tokenMint,
        depositor: gemOwner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [v.vaultOwner, gemOwner],
    });
  }

  async function looper() {
    const nVaults = 10;
    const nGemsPerVault = 10;

    await startBank();
    console.log('bank ready');

    //vaults
    const vaultPromises = [];
    for (let i = 0; i < nVaults; i++) {
      vaultPromises.push(createVault());
      // console.log(`vault ${i + 1} added`);
    }
    await Promise.all(vaultPromises);
    console.log('vaults ready');

    //gems
    const gemPromises: any[] = [];
    vaults.forEach((v: IVault) => {
      for (let i = 0; i < nGemsPerVault; i++) {
        gemPromises.push(addGem(v));
        // console.log(`added gem ${i + 1} to vault ${v.vault.toBase58()}`);
      }
    });
    await Promise.all(gemPromises);
    console.log('gems ready');
  }

  it('creates A LOT of PDAs & reads them back correctly', async () => {
    await looper();

    const bankPDAs = await gb.fetchAllBankPDAs();
    const vaultPDAs = await gb.fetchAllVaultPDAs();
    const gemBoxPDAs = await gb.fetchAllGdrPDAs(vaults[0].vault);

    assert.equal(bankPDAs.length, 1);
    assert.equal(vaultPDAs.length, 10);
    assert.equal(gemBoxPDAs.length, 10);
  });
});
