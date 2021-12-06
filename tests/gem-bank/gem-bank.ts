import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { AccountInfo } from '@solana/spl-token';
import { AccountUtils } from '../utils/account';
import { GemBank } from '../../target/types/gem_bank';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export class GemBankUtils extends AccountUtils {
  provider: anchor.Provider;
  program: anchor.Program<GemBank>;

  constructor(provider: anchor.Provider, program: anchor.Program<GemBank>) {
    super(provider.connection, provider.wallet as anchor.Wallet);
    this.provider = provider;
    this.program = program;
  }

  async getBankAcc(bank: PublicKey) {
    return this.program.account.bank.fetch(bank);
  }

  async getVaultAcc(vault: PublicKey) {
    return this.program.account.vault.fetch(vault);
  }

  async getGDRAcc(GDR: PublicKey) {
    return this.program.account.gemDepositReceipt.fetch(GDR);
  }

  async getGemAcc(mint: PublicKey, gemAcc: PublicKey): Promise<AccountInfo> {
    return this.deserializeTokenAccount(mint, gemAcc);
  }

  async getVaultPDA(bank: PublicKey, founder: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'vault',
      bank,
      founder,
    ]);
  }

  async getGemBoxPDA(vault: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'gem_box',
      vault,
      mint,
    ]);
  }

  async getGdrPDA(vault: PublicKey, mint: PublicKey) {
    return this.findProgramAddress(this.program.programId, [
      'gem_deposit_receipt',
      vault,
      mint,
    ]);
  }

  async getVaultAuthorityPDA(vault: PublicKey) {
    return this.findProgramAddress(this.program.programId, [vault]);
  }
}
