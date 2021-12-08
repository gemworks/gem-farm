import * as anchor from '@project-serum/anchor';
import { BN, Idl } from '@project-serum/anchor';
import { GemBankClient } from '../../../../tests/gem-bank/gem-bank.client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import { DEFAULTS } from '@/globals';

//need a separate func coz fetching IDL is async and can't be done in constructor
export async function initGemBank(
  conn: Connection,
  wallet: SignerWalletAdapter
) {
  const idl = await (await fetch('gem_bank.json')).json();
  return new GemBank(conn, wallet, idl);
}

export class GemBank extends GemBankClient {
  constructor(conn: Connection, wallet: SignerWalletAdapter, idl: Idl) {
    const programId = DEFAULTS.GEM_BANK_PROG_ID;
    super(conn, wallet as any as anchor.Wallet, idl, programId);
  }

  async startBankWallet() {
    const bank = Keypair.generate();
    const txSig = await this.startBank(bank, this.wallet.publicKey);
    return { bank, txSig };
  }

  async createVaultWallet(bank: PublicKey) {
    return this.createVault(bank, this.wallet.publicKey, this.wallet.publicKey);
  }

  async setVaultLockWallet(
    bank: PublicKey,
    vault: PublicKey,
    vaultLocked: boolean
  ) {
    return this.setVaultLock(bank, vault, this.wallet.publicKey, vaultLocked);
  }

  async depositGemWallet(
    bank: PublicKey,
    vault: PublicKey,
    gemAmount: BN,
    gemMint: PublicKey,
    gemSource: PublicKey
  ) {
    return this.depositGem(
      bank,
      vault,
      this.wallet.publicKey,
      gemAmount,
      gemMint,
      gemSource,
      this.wallet.publicKey
    );
  }

  async withdrawGemWallet(
    bank: PublicKey,
    vault: PublicKey,
    gemAmount: BN,
    gemMint: PublicKey,
    gemDestination: PublicKey
  ) {
    return this.withdrawGem(
      bank,
      vault,
      this.wallet.publicKey,
      gemAmount,
      gemMint,
      gemDestination,
      this.wallet.publicKey
    );
  }
}
