import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { AccountInfo } from '@solana/spl-token';
import { AccountUtils } from '../utils/account';

export enum BankFlags {
  FreezeVaults = 1 << 0,
}

export class GemBankUtils extends AccountUtils {
  provider: anchor.Provider;
  program: anchor.Program;

  constructor(provider: anchor.Provider, program: anchor.Program) {
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

  async getGemAcc(mint: PublicKey, gemAcc: PublicKey): Promise<AccountInfo> {
    return this.deserializeTokenAccount(mint, gemAcc);
  }

  async getNextVaultPDA(bank: PublicKey) {
    const nextVaultId = (await this.getBankAcc(bank)).vaultCount.add(new BN(1));
    return this.findProgramAddress(this.program.programId, [
      'vault',
      bank,
      nextVaultId.toBuffer('le', 8),
    ]);
  }

  async getNextGemBoxPDA(vault: PublicKey) {
    const nextGemBoxId = (await this.getVaultAcc(vault)).gemBoxCount.add(
      new BN(1)
    );
    return this.findProgramAddress(this.program.programId, [
      'gem_box',
      vault,
      nextGemBoxId.toBuffer('le', 8),
    ]);
  }

  async getVaultAuthorityPDA(vault: PublicKey) {
    return this.findProgramAddress(this.program.programId, [vault]);
  }
}
