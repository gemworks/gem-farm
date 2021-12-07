import * as anchor from '@project-serum/anchor';
import { BN, Idl } from '@project-serum/anchor';
import { GemBankUtils } from '../../../../tests/gem-bank/gem-bank';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import { DEFAULTS } from '@/globals';

//need a separate func coz fetching IDL is async and can't be done in constructor
export async function initGemBank(
  conn: Connection,
  wallet: SignerWalletAdapter
) {
  const idl = await (await fetch('gem_bank.json')).json();
  return new GemBankClient(conn, wallet, idl);
}

export class GemBankClient extends GemBankUtils {
  constructor(conn: Connection, wallet: SignerWalletAdapter, idl: Idl) {
    const programId = DEFAULTS.GEM_BANK_PROG_ID;
    super(conn, wallet as any as anchor.Wallet, idl, programId);
  }

  async startBank() {
    const bank = Keypair.generate();
    console.log('starting bank at', bank.publicKey.toBase58());
    return await this.program.rpc.initBank({
      accounts: {
        bank: bank.publicKey,
        manager: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [bank],
    });
  }

  async createVault(bank: PublicKey) {
    const [vault, bump] = await this.findVaultPDA(bank, this.wallet.publicKey);
    console.log('creating vault at', vault.toBase58());
    return await this.program.rpc.initVault(bump, this.wallet.publicKey, {
      accounts: {
        bank: bank,
        vault: vault,
        creator: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [],
    });
  }

  async addGem(
    bank: PublicKey,
    vault: PublicKey,
    gemAmount: BN,
    gemMint: PublicKey,
    gemSource: PublicKey
  ) {
    const [gemBox, gemBump] = await this.findGemBoxPDA(vault, gemMint);
    const [GDR, GDRBump] = await this.findGdrPDA(vault, gemMint);
    const [vaultAuth] = await this.findVaultAuthorityPDA(vault);
    console.log(`adding gem at ${gemBox.toBase58()}, GDR ${GDR.toBase58()}`);

    return await this.program.rpc.depositGem(gemBump, GDRBump, gemAmount, {
      accounts: {
        bank: bank,
        vault: vault,
        owner: this.wallet.publicKey,
        authority: vaultAuth,
        gemBox,
        gemDepositReceipt: GDR,
        gemSource,
        gemMint,
        depositor: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [],
    });
  }
}
