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
import BN from 'bn.js';

export async function initGemFarm(
  conn: Connection,
  wallet?: SignerWalletAdapter
) {
  const walletToUse = wallet ?? createFakeWallet();
  const idl = await (await fetch('gem_farm.json')).json();
  return new GemFarm(conn, walletToUse as anchor.Wallet, idl);
}

export class GemFarm extends GemFarmClient {
  constructor(conn: Connection, wallet: anchor.Wallet, idl: Idl) {
    const programId = DEFAULTS.GEM_BANK_PROG_ID;
    super(conn, wallet, idl, programId);
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
