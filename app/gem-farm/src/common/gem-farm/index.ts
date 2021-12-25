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
import { toBN } from '../../../../../tests/utils/types';

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

    const stuff = await this.initFarm(
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

    return { farm, bank, ...stuff };
  }

  async authorizeFunderWallet(farm: PublicKey, funder: PublicKey) {
    return this.authorizeFunder(farm, this.wallet.publicKey, funder);
  }

  async deauthorizeFunderWallet(farm: PublicKey, funder: PublicKey) {
    return this.deauthorizeFunder(farm, this.wallet.publicKey, funder);
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

    return this.fundReward(
      farm,
      rewardMint,
      this.wallet.publicKey,
      rewardSource,
      config
    );
  }

  async fundFixedRewardWallet(
    farm: PublicKey,
    rewardMint: PublicKey,
    baseRate: number,
    t1RewardRate: number,
    t1RequiredTenure: number,
    t2RewardRate: number,
    t2RequiredTenure: number,
    t3RewardRate: number,
    t3RequiredTenure: number,
    amount: number,
    duration: number
  ) {
    const rewardSource = await this.findATA(rewardMint, this.wallet.publicKey);

    const config: FixedRateConfig = {
      schedule: {
        baseRate: toBN(baseRate),
        tier1: {
          rewardRate: toBN(t1RewardRate),
          requiredTenure: toBN(t1RequiredTenure),
        },
        tier2: {
          rewardRate: toBN(t2RewardRate),
          requiredTenure: toBN(t2RequiredTenure),
        },
        tier3: {
          rewardRate: toBN(t3RewardRate),
          requiredTenure: toBN(t3RequiredTenure),
        },
      },
      amount: toBN(amount),
      durationSec: toBN(duration),
    };

    return this.fundReward(
      farm,
      rewardMint,
      this.wallet.publicKey,
      rewardSource,
      undefined,
      config
    );
  }
}
