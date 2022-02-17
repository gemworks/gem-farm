import { BN, Idl } from '@project-serum/anchor';
import {
  findWhitelistProofPDA,
  GEM_BANK_PROG_ID,
  GemBankClient,
  WhitelistType,
} from '@gemworks/gem-farm-ts';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import { NodeWallet, programs } from '@metaplex/js';

//when we only want to view vaults, no need to connect a real wallet.
export function createFakeWallet() {
  const leakedKp = Keypair.fromSecretKey(
    Uint8Array.from([
      208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199, 242,
      120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179, 84,
      137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242, 57, 158,
      226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249, 157, 62, 80,
    ])
  );
  return new NodeWallet(leakedKp);
}

//need a separate func coz fetching IDL is async and can't be done in constructor
export async function initGemBank(
  conn: Connection,
  wallet?: SignerWalletAdapter
) {
  const walletToUse = wallet ?? createFakeWallet();
  const idl = await (await fetch('gem_bank.json')).json();
  return new GemBank(conn, walletToUse as any, idl);
}

export class GemBank extends GemBankClient {
  constructor(conn: Connection, wallet: any, idl: Idl) {
    super(conn, wallet, idl, GEM_BANK_PROG_ID);
  }

  async initBankWallet() {
    const bank = Keypair.generate();
    const txSig = await this.initBank(
      bank,
      this.wallet.publicKey,
      this.wallet.publicKey
    );
    return { bank, txSig };
  }

  async initVaultWallet(bank: PublicKey) {
    return this.initVault(
      bank,
      this.wallet.publicKey,
      this.wallet.publicKey,
      this.wallet.publicKey,
      'test_vault'
    );
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
    gemSource: PublicKey,
    creator: PublicKey
  ) {
    const [mintProof, bump] = await findWhitelistProofPDA(bank, gemMint);
    const [creatorProof, bump2] = await findWhitelistProofPDA(bank, creator);
    const metadata = await programs.metadata.Metadata.getPDA(gemMint);

    return this.depositGem(
      bank,
      vault,
      this.wallet.publicKey,
      gemAmount,
      gemMint,
      gemSource,
      mintProof,
      metadata,
      creatorProof
    );
  }

  async withdrawGemWallet(
    bank: PublicKey,
    vault: PublicKey,
    gemAmount: BN,
    gemMint: PublicKey
  ) {
    return this.withdrawGem(
      bank,
      vault,
      this.wallet.publicKey,
      gemAmount,
      gemMint,
      this.wallet.publicKey
    );
  }

  async addToWhitelistWallet(
    bank: PublicKey,
    addressToWhitelist: PublicKey,
    whitelistType: WhitelistType
  ) {
    return this.addToWhitelist(
      bank,
      this.wallet.publicKey,
      addressToWhitelist,
      whitelistType
    );
  }

  async removeFromWhitelistWallet(bank: PublicKey, addressToRemove: PublicKey) {
    return this.removeFromWhitelist(
      bank,
      this.wallet.publicKey,
      addressToRemove
    );
  }
}
