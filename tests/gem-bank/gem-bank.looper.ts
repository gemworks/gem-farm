import * as anchor from '@project-serum/anchor';
import { BN, Program } from '@project-serum/anchor';
import { GemBank } from '../../target/types/gem_bank';
import { GemBankUtils } from './gem-bank';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { ITokenData } from '../utils/account';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const provider = anchor.Provider.env();
anchor.setProvider(provider);
const program = anchor.workspace.GemBank as Program<GemBank>;

const b = new GemBankUtils(provider, program as any);

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

//state
const bank = Keypair.generate();
let manager: Keypair;
let vaults: IVault[] = [];

async function spawnBank() {
  manager = await b.createWallet(100 * LAMPORTS_PER_SOL);
  await program.rpc.initBank({
    accounts: {
      bank: bank.publicKey,
      manager: manager.publicKey,
      systemProgram: SystemProgram.programId,
    },
    signers: [manager, bank],
  });
}

async function addVault() {
  const vaultOwner = await b.createWallet(100 * LAMPORTS_PER_SOL);
  const [vault, bump] = await b.getNextVaultPDA(bank.publicKey);
  const [vaultAuth] = await b.getVaultAuthorityPDA(vault);
  await program.rpc.initVault(bump, vaultOwner.publicKey, {
    accounts: {
      vault: vault,
      payer: vaultOwner.publicKey,
      bank: bank.publicKey,
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

async function addGemBox(v: IVault) {
  //create a fresh gem owner + gem & mint a random amount
  const gemAmount = new BN(Math.ceil(Math.random() * 100));
  const gemOwner = await b.createWallet(100 * LAMPORTS_PER_SOL);
  const gem = await b.createMintAndATA(gemOwner.publicKey, gemAmount);

  //get the next gem box
  const [gemBox, gemBump] = await b.getNextGemBoxPDA(v.vault);

  await program.rpc.depositGem(gemBump, gemAmount, {
    accounts: {
      bank: bank.publicKey,
      vault: v.vault,
      owner: v.vaultOwner.publicKey,
      authority: v.vaultAuth,
      gemBox: gemBox,
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

/*
 * The idea for this fn is to test how quickly you can deserialize a large Nr of vaults + gemBoxes
 */
async function looper() {
  const nVaults = 10;
  const nGemsPerVault = 10;

  await spawnBank();
  console.log('bank ready');

  const promises = [];
  for (let i = 0; i < nVaults; i++) {
    await addVault();
    promises.push(addVault());
    // console.log(`vault ${i + 1} added`);
  }
  await Promise.all(promises);

  console.log(vaults);
}

looper();
