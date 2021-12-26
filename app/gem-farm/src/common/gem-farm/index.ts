import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import * as anchor from '@project-serum/anchor';
import { Idl } from '@project-serum/anchor';
import { DEFAULTS } from '@/globals';
import { createFakeWallet } from '@/common/gem-bank';
import {
  GemFarmClient,
  FarmConfig,
  VariableRateConfig,
  FixedRateConfig,
} from '../../../../../tests/gem-farm/gem-farm.client';
import {
  stringifyPubkeysAndBNsInObject,
  toBN,
} from '../../../../../tests/utils/types';

export async function initGemFarm(
  conn: Connection,
  wallet?: SignerWalletAdapter
) {
  const walletToUse = wallet ?? createFakeWallet();
  const farmIdl = await (await fetch('gem_farm.json')).json();
  const bankIdl = await (await fetch('gem_bank.json')).json();
  return new GemFarm(conn, walletToUse as anchor.Wallet, farmIdl, bankIdl);
}

export class GemFarm extends GemFarmClient {
  constructor(
    conn: Connection,
    wallet: anchor.Wallet,
    farmIdl: Idl,
    bankIdl: Idl
  ) {
    const farmProgId = DEFAULTS.GEM_FARM_PROG_ID;
    const bankProgId = DEFAULTS.GEM_BANK_PROG_ID;
    super(conn, wallet, farmIdl, farmProgId, bankIdl, bankProgId);
  }

  async createTestReward(initialFundingAmount: number) {
    return this.createMintAndFundATAWithWallet(
      this.wallet,
      0,
      initialFundingAmount
    );
  }

  async initFarmWallet(
    rewardAMint: PublicKey,
    rewardAType: any,
    rewardBMint: PublicKey,
    rewardBType: any,
    farmConfig: FarmConfig
  ) {
    const farm = Keypair.generate();
    const bank = Keypair.generate();

    const result = await this.initFarm(
      farm,
      this.wallet.publicKey,
      this.wallet.publicKey,
      bank,
      rewardAMint,
      rewardAType,
      rewardBMint,
      rewardBType,
      farmConfig
    );

    console.log('new farm started!', farm.publicKey.toBase58());
    console.log('bank is:', bank.publicKey.toBase58());

    return { farm, bank, ...result };
  }

  async authorizeFunderWallet(farm: PublicKey, funder: PublicKey) {
    const result = await this.authorizeFunder(
      farm,
      this.wallet.publicKey,
      funder
    );

    console.log('authorized funder', funder.toBase58());

    return result;
  }

  async deauthorizeFunderWallet(farm: PublicKey, funder: PublicKey) {
    const result = await this.deauthorizeFunder(
      farm,
      this.wallet.publicKey,
      funder
    );

    console.log('DEauthorized funder', funder.toBase58());

    return result;
  }

  async fundVariableRewardWallet(
    farm: PublicKey,
    rewardMint: PublicKey,
    amount: number,
    duration: number
  ) {
    const rewardSource = await this.findATA(rewardMint, this.wallet.publicKey);

    const config: VariableRateConfig = {
      amount: toBN(amount),
      durationSec: toBN(duration),
    };

    const result = this.fundReward(
      farm,
      rewardMint,
      this.wallet.publicKey,
      rewardSource,
      config
    );

    console.log('funded variable reward with mint:', rewardMint.toBase58());

    return result;
  }

  async fundFixedRewardWallet(
    farm: PublicKey,
    rewardMint: PublicKey,
    amount: number,
    duration: number,
    baseRate: number,
    t1RewardRate?: number,
    t1RequiredTenure?: number,
    t2RewardRate?: number,
    t2RequiredTenure?: number,
    t3RewardRate?: number,
    t3RequiredTenure?: number
  ) {
    const rewardSource = await this.findATA(rewardMint, this.wallet.publicKey);

    const config: FixedRateConfig = {
      schedule: {
        baseRate: toBN(baseRate),
        tier1: t1RewardRate
          ? {
              rewardRate: toBN(t1RewardRate),
              requiredTenure: toBN(t1RequiredTenure),
            }
          : null,
        tier2: t2RewardRate
          ? {
              rewardRate: toBN(t2RewardRate),
              requiredTenure: toBN(t2RequiredTenure),
            }
          : null,
        tier3: t3RewardRate
          ? {
              rewardRate: toBN(t3RewardRate),
              requiredTenure: toBN(t3RequiredTenure),
            }
          : null,
      },
      amount: toBN(amount),
      durationSec: toBN(duration),
    };

    const result = await this.fundReward(
      farm,
      rewardMint,
      this.wallet.publicKey,
      rewardSource,
      undefined,
      config
    );

    console.log('funded fixed reward with mint:', rewardMint.toBase58());

    return result;
  }

  async cancelRewardWallet(farm: PublicKey, rewardMint: PublicKey) {
    const result = await this.cancelReward(
      farm,
      this.wallet.publicKey,
      rewardMint,
      this.wallet.publicKey
    );

    console.log('cancelled reward', rewardMint.toBase58());

    return result;
  }

  async lockRewardWallet(farm: PublicKey, rewardMint: PublicKey) {
    const result = await this.lockReward(
      farm,
      this.wallet.publicKey,
      rewardMint
    );

    console.log('locked reward', rewardMint.toBase58());

    return result;
  }
}
