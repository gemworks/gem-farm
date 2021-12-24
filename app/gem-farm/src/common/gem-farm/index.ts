import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import * as anchor from '@project-serum/anchor';
import { Idl } from '@project-serum/anchor';
import { DEFAULTS } from '@/globals';
import { createFakeWallet } from '@/common/gem-bank';
import {
  GemFarmClient,
  FarmConfig,
} from '../../../../../tests/gem-farm/gem-farm.client';

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
}
