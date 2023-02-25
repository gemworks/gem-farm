import {
  Account,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenError
} from '@solana/spl-token';
import {AccountInfo, Connection, Keypair, PublicKey} from '@solana/web3.js';

export interface ITokenData {
  tokenMint: PublicKey;
  tokenAcc: PublicKey;
  owner: PublicKey;
  token: PublicKey;
}

export class AccountUtils {
  conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  // --------------------------------------- PDA

  async findProgramAddress(
    programId: PublicKey,
    seeds: (PublicKey | Uint8Array | string)[]
  ): Promise<[PublicKey, number]> {
    const seed_bytes = seeds.map((s) => {
      if (typeof s == 'string') {
        return Buffer.from(s);
      } else if ('toBytes' in s) {
        return s.toBytes();
      } else {
        return s;
      }
    });
    return await PublicKey.findProgramAddress(seed_bytes, programId);
  }

  // --------------------------------------- Normal account

  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.conn.getBalance(publicKey);
  }

  // --------------------------------------- Token account

  async deserializeTokenAccount(
    mint: PublicKey,
    tokenAccount: PublicKey
  ): Promise<Account> {
    return await getAccount(this.conn, tokenAccount);
  }

  async findATA(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return getAssociatedTokenAddress(mint, owner, true);
  }
}
