// import * as anchor from '@project-serum/anchor';
// import { BN, Program } from '@project-serum/anchor';
// import { GemBank } from '../../target/types/gem_bank';
// import { GemBankUtils } from './gem-bank';
// import {
//   Keypair,
//   LAMPORTS_PER_SOL,
//   PublicKey,
//   SystemProgram,
// } from '@solana/web3.js';
// import { ITokenData } from '../utils/account';
// import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
//
// const provider = anchor.Provider.env();
// anchor.setProvider(provider);
// const program = anchor.workspace.GemBank as Program<GemBank>;
//
// const gb = new GemBankUtils(provider, program as any);
//
// interface IGemBox {
//   gem: ITokenData;
//   gemBox: PublicKey;
//   gemOwner: PublicKey;
// }
//
// interface IVault {
//   vault: PublicKey;
//   vaultOwner: Keypair;
//   vaultAuth: PublicKey;
//   gemBoxes: IGemBox[];
// }
//
// //state
// const bank = Keypair.generate();
// let manager: Keypair;
// let vaults: IVault[] = [];
//
// async function spawnBank() {
//   manager = await gb.createWallet(100 * LAMPORTS_PER_SOL);
//   await program.rpc.initBank({
//     accounts: {
//       bank: bank.publicKey,
//       manager: manager.publicKey,
//       systemProgram: SystemProgram.programId,
//     },
//     signers: [manager, bank],
//   });
// }
//
// async function addVault() {
//   const vaultOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
//   const [vault, bump] = await gb.getVaultPDA(
//     bank.publicKey,
//     vaultOwner.publicKey
//   );
//   const [vaultAuth] = await gb.getVaultAuthorityPDA(vault);
//   await program.rpc.initVault(bump, vaultOwner.publicKey, {
//     accounts: {
//       bank: bank.publicKey,
//       vault: vault,
//       founder: vaultOwner.publicKey,
//       systemProgram: SystemProgram.programId,
//     },
//     signers: [vaultOwner],
//   });
//   vaults.push({
//     vault,
//     vaultOwner,
//     vaultAuth,
//     gemBoxes: [],
//   });
// }
//
// async function addGem(v: IVault) {
//   //create a fresh gem owner + gem & mint a random amount
//   const gemAmount = new BN(Math.ceil(Math.random() * 100));
//   const gemOwner = await gb.createWallet(100 * LAMPORTS_PER_SOL);
//   const gem = await gb.createMintAndATA(gemOwner.publicKey, gemAmount);
//
//   //get the next gem box
//   const [gemBox, gemBump] = await gb.getGemBoxPDA(v.vault, gem.tokenMint);
//
//   await program.rpc.depositGem(gemBump, gemAmount, {
//     accounts: {
//       bank: bank.publicKey,
//       vault: v.vault,
//       owner: v.vaultOwner.publicKey,
//       authority: v.vaultAuth,
//       gemBox: gemBox,
//       gemSource: gem.tokenAcc,
//       gemMint: gem.tokenMint,
//       depositor: gemOwner.publicKey,
//       tokenProgram: TOKEN_PROGRAM_ID,
//       systemProgram: SystemProgram.programId,
//       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//     },
//     signers: [v.vaultOwner, gemOwner],
//   });
// }
//
// /*
//  * The idea for this fn is to test how quickly you can deserialize a large Nr of vaults + gemBoxes
//  */
// async function looper() {
//   const nVaults = 10;
//   const nGemsPerVault = 10;
//
//   await spawnBank();
//   console.log('bank ready');
//
//   //vaults
//   const vaultPromises = [];
//   for (let i = 0; i < nVaults; i++) {
//     vaultPromises.push(addVault());
//     console.log(`vault ${i + 1} added`);
//   }
//   await Promise.all(vaultPromises);
//   console.log('vaults ready');
//
//   //gems
//   const gemPromises: any[] = [];
//   vaults.forEach((v: IVault) => {
//     for (let i = 0; i < nGemsPerVault; i++) {
//       gemPromises.push(addGem(v));
//       console.log(`added gem ${i + 1} to vault ${v.vault.toBase58()}`);
//     }
//   });
//   await Promise.all(gemPromises);
//   console.log('gems ready');
// }
//
// async function readBankPDAs() {
//   const pdas = await program.account.bank.all();
//   // console.log(pdas);
//   console.log(`found a total of ${pdas.length} BANK pdas`);
// }
//
// async function readVaultPDAs() {
//   const v = await program.account.vault.fetch(vaults[0].vault);
//   console.log(v.bank.toBase58());
//
//   //https://project-serum.github.io/anchor/ts/classes/accountclient.html#all
//   const pdas = await program.account.vault.all([
//     {
//       memcmp: {
//         offset: 8, //need to prepend 8 bytes for anchor's disc
//         bytes: bank.publicKey.toBase58(),
//       },
//     },
//   ]);
//   // console.log(pdas);
//   console.log(
//     `found a total of ${
//       pdas.length
//     } VAULT pdas for bank ${bank.publicKey.toBase58()}`
//   );
// }
//
// //https://spl.solana.com/token#finding-all-token-accounts-for-a-wallet
// async function readGemBoxPDAs(vault: IVault) {
//   const pdas = await gb.conn.getParsedProgramAccounts(
//     new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
//     {
//       filters: [
//         {
//           dataSize: 165,
//         },
//         {
//           memcmp: {
//             offset: 16,
//             bytes: bank.publicKey.toBase58(),
//           },
//         },
//       ],
//     }
//   );
//   console.log(pdas);
//   console.log(
//     `found a total of ${
//       pdas.length
//     } GEM BOX pdas for vault ${vault.vault.toBase58()}`
//   );
// }
//
// (async () => {
//   await looper();
//   await readBankPDAs();
//   await readVaultPDAs();
//   await readGemBoxPDAs(vaults[0]);
// })();
