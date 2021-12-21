// import * as anchor from '@project-serum/anchor';
// import { BN } from '@project-serum/anchor';
// import {
//   FarmConfig,
//   GemFarmClient,
//   RewardType,
//   VariableRateConfig,
// } from './gem-farm.client';
// import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
// import chai, { assert, expect } from 'chai';
// import chaiAsPromised from 'chai-as-promised';
// import { Token } from '@solana/spl-token';
// import { pause } from '../utils/types';
// import { prepGem } from '../utils/gem-common';
// import { ITokenData } from '../utils/account';
// import { printStructsGeneric } from './gem-farm.tester';
//
// chai.use(chaiAsPromised);
//
// const _provider = anchor.Provider.env();
// const gf = new GemFarmClient(
//   _provider.connection,
//   _provider.wallet as anchor.Wallet
// );
//
// const config = <VariableRateConfig>{
//   amount: new BN(10000), //10k
//   durationSec: new BN(100), //at rate 100/s
// };
//
// describe('gem farm (variable rewards)', () => {
//   //farm + bank
//   let bank: Keypair;
//   let farm: Keypair;
//   let farmManager: Keypair;
//
//   //farmer 1 + vault
//   let farmer1Identity: Keypair;
//   let farmer1Vault: PublicKey;
//   let farmer2Identity: Keypair;
//   let farmer2Vault: PublicKey;
//
//   //rewards + funder
//   const reward = 'rewardA'; //todo switch
//   let rewardMint: Token;
//   let rewardSource: PublicKey;
//   let rewardSecondMint: Token;
//   const funder = gf.wallet.payer;
//
//   async function printStructs(state: string) {
//     await printStructsGeneric(
//       gf,
//       state,
//       farm,
//       farmer1Identity,
//       farmer2Identity
//     );
//   }
//
//   async function configureAccounts() {
//     bank = Keypair.generate();
//     farm = Keypair.generate();
//     farmManager = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//
//     farmer1Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//     farmer2Identity = await gf.createWallet(100 * LAMPORTS_PER_SOL);
//
//     rewardMint = await gf.createToken(0, funder.publicKey);
//     rewardSource = await gf.createAndFundATA(rewardMint, funder, config.amount);
//     rewardSecondMint = await gf.createToken(0, funder.publicKey);
//   }
//
//   async function prepFarm() {
//     const farmConfig = <FarmConfig>{
//       minStakingPeriodSec: new BN(0),
//       cooldownPeriodSec: new BN(0),
//       unstakingFeeLamp: new BN(LAMPORTS_PER_SOL),
//     };
//
//     await gf.initFarm(
//       farm,
//       farmManager,
//       farmManager,
//       bank,
//       rewardMint.publicKey,
//       RewardType.Variable,
//       rewardSecondMint.publicKey,
//       RewardType.Variable,
//       farmConfig
//     );
//   }
//
//   async function prepFarmer(identity: Keypair) {
//     return gf.initFarmer(farm.publicKey, identity, identity);
//   }
//
//   async function prepAuthorization() {
//     return gf.authorizeFunder(farm.publicKey, farmManager, funder.publicKey);
//   }
//
//   async function prepDeauthorization() {
//     return gf.deauthorizeFunder(farm.publicKey, farmManager, funder.publicKey);
//   }
//
//   async function prepFundReward() {
//     return gf.fundReward(
//       farm.publicKey,
//       rewardMint.publicKey,
//       funder,
//       rewardSource,
//       config
//     );
//   }
//
//   async function prepCancelReward() {
//     return gf.cancelReward(
//       farm.publicKey,
//       farmManager,
//       rewardMint.publicKey,
//       funder.publicKey
//     );
//   }
//
//   describe('core + funder + farmer ops', () => {
//     before('configures accounts', async () => {
//       await configureAccounts();
//     });
//
//     // --------------------------------------- gems & rewards
//
//     describe('farmer ops', () => {
//       //gem 1 used by farmer 1
//       let gem1Amount: anchor.BN;
//       let gem1: ITokenData;
//       //gem 2 used by farmer 2
//       let gem2Amount: anchor.BN;
//       let gem2: ITokenData;
//
//       before('funds the rewards', async () => {
//         await prepAuthorization();
//         await prepFundReward();
//       });
//
//       beforeEach('creates a fresh gem', async () => {
//         ({ gemAmount: gem1Amount, gem: gem1 } = await prepGem(
//           gf,
//           farmer1Identity
//         ));
//         ({ gemAmount: gem2Amount, gem: gem2 } = await prepGem(
//           gf,
//           farmer2Identity
//         ));
//       });
//
//       async function prepDeposit(gems: BN, identity: Keypair) {
//         const isFarmer1 =
//           identity.publicKey.toBase58() ===
//           farmer1Identity.publicKey.toBase58();
//
//         return gf.depositGem(
//           bank.publicKey,
//           isFarmer1 ? farmer1Vault : farmer2Vault,
//           identity,
//           gems,
//           isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
//           isFarmer1 ? gem1.tokenAcc : gem2.tokenAcc
//         );
//       }
//
//       async function prepWithdraw(gems: BN, identity: Keypair) {
//         const isFarmer1 =
//           identity.publicKey.toBase58() ===
//           farmer1Identity.publicKey.toBase58();
//
//         return gf.withdrawGem(
//           bank.publicKey,
//           isFarmer1 ? farmer1Vault : farmer2Vault,
//           identity,
//           gems,
//           isFarmer1 ? gem1.tokenMint : gem2.tokenMint,
//           identity.publicKey
//         );
//       }
//
//       async function prepRefreshFarmer(identity: Keypair) {
//         return gf.refreshFarmer(farm.publicKey, identity);
//       }
//
//
//     });
//   });
//
//   describe('reward ops', () => {
//     before('configures accounts', async () => {
//       await configureAccounts();
//       await prepFarm();
//       await prepFarmer(farmer1Identity);
//       await prepAuthorization();
//     });
//
//
//
//     async function mintToSource(amount: number) {
//       await rewardMint.mintTo(rewardSource, gf.wallet.payer, [], amount);
//     }
//
//     it('funds -> no stakers -> refunds entire amount', async () => {});
//     it('funds -> has stakers -> refunds leftovers but NOT accrued amount', async () => {});
//
//     //todo ok 4 funding cases:
//     // 1)fresh reward
//     // 2)previously exhausted reward
//     // 3)merged reward
//     // 4)previously cancelled reward
//
//     it('funds twice then cancels', async () => {});
//
//
//   });
//
//   // describe('min staking / cooldown > 0', () => {
//   //   let gem1Amount: anchor.BN;
//   //   let gem1: ITokenData;
//   //
//   //   before('configures accounts', async () => {
//   //     await configureAccounts();
//   //
//   //     const farmConfig = <FarmConfig>{
//   //       minStakingPeriodSec: new BN(5), //<--
//   //       cooldownPeriodSec: new BN(5), //<--
//   //       unstakingFeeLamp: new BN(0),
//   //     };
//   //
//   //     //farm
//   //     await gf.initFarm(
//   //       farm,
//   //       farmManager,
//   //       farmManager,
//   //       bank,
//   //       rewardMint.publicKey,
//   //       RewardType.Variable,
//   //       rewardSecondMint.publicKey,
//   //       RewardType.Variable,
//   //       farmConfig
//   //     );
//   //
//   //     //farmer
//   //     const { vault } = await gf.initFarmer(
//   //       farm.publicKey,
//   //       farmer1Identity,
//   //       farmer1Identity
//   //     );
//   //     farmer1Vault = vault;
//   //
//   //     //gem
//   //     ({ gemAmount: gem1Amount, gem: gem1 } = await prepGem(
//   //       gf,
//   //       farmer1Identity
//   //     ));
//   //   });
//   //
//   //   async function prepDeposit(gemAmount: BN) {
//   //     return gf.depositGem(
//   //       bank.publicKey,
//   //       farmer1Vault,
//   //       farmer1Identity,
//   //       gemAmount,
//   //       gem1.tokenMint,
//   //       gem1.tokenAcc
//   //     );
//   //   }
//   //
//   //   async function prepWithdrawal(gemAmount: BN) {
//   //     return gf.withdrawGem(
//   //       bank.publicKey,
//   //       farmer1Vault,
//   //       farmer1Identity,
//   //       gemAmount,
//   //       gem1.tokenMint,
//   //       farmer1Identity.publicKey
//   //     );
//   //   }
//   //
//   //   it('moves through farmer lifecycle (unstaked -> staked -> cooldown)', async () => {
//   //     //deposit some gems into the vault
//   //     await prepDeposit(gem1Amount);
//   //
//   //     //stake
//   //     const { farmer, vault } = await gf.stake(farm.publicKey, farmer1Identity);
//   //
//   //     //unstaking fails, since min period not passed
//   //     await expect(
//   //       gf.unstake(farm.publicKey, farmer1Identity)
//   //     ).to.be.rejectedWith('0x156');
//   //
//   //     await pause(6000);
//   //
//   //     //begin cooldown
//   //     await gf.unstake(farm.publicKey, farmer1Identity);
//   //
//   //     //withdrawal fails, since cooldown period not passed
//   //     await expect(prepWithdrawal(gem1Amount)).to.be.rejectedWith('0x140');
//   //
//   //     await pause(6000);
//   //
//   //     //run again to unlock vault
//   //     await gf.unstake(farm.publicKey, farmer1Identity);
//   //
//   //     //this time works
//   //     await prepWithdrawal(gem1Amount);
//   //
//   //     const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
//   //     assert(farmAcc.stakedFarmerCount.eq(new BN(0)));
//   //     assert(farmAcc.gemsStaked.eq(new BN(0)));
//   //
//   //     const vaultAcc = await gf.fetchVaultAcc(vault);
//   //     assert.isFalse(vaultAcc.locked);
//   //
//   //     const farmerAcc = await gf.fetchFarmerAcc(farmer);
//   //     assert(farmerAcc.gemsStaked.eq(new BN(0)));
//   //   });
//   // });
// });
