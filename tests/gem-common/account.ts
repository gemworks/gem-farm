import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { BN, Wallet } from '@project-serum/anchor';
import {
  AccountInfo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintInfo,
  NATIVE_MINT,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export interface ITokenData {
  tokenMint: PublicKey;
  tokenAcc: PublicKey;
  owner: PublicKey;
  token: Token;
}

export class AccountUtils {
  conn: Connection;
  wallet: Wallet; //node wallet

  constructor(conn: Connection, wallet: Wallet) {
    this.conn = conn;
    this.wallet = wallet;
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

  // --------------------------------------- Wallet / Keypair

  async createFundedWallet(lamports: number): Promise<Keypair> {
    const wallet = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports,
      })
    );
    await sendAndConfirmTransaction(this.conn, tx, [this.wallet.payer]);
    return wallet;
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.conn.getBalance(publicKey);
  }

  // --------------------------------------- Mint

  async deserializeToken(mint: PublicKey): Promise<Token> {
    //doesn't matter which keypair goes here, we just need some key for instantiation
    const throwawayKeypair = Keypair.fromSecretKey(
      Uint8Array.from([
        208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199,
        242, 120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179,
        84, 137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242,
        57, 158, 226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249,
        157, 62, 80,
      ])
    );
    return new Token(this.conn, mint, TOKEN_PROGRAM_ID, throwawayKeypair);
  }

  async deserializeTokenMint(mint: PublicKey): Promise<MintInfo> {
    const t = await this.deserializeToken(mint);
    return t.getMintInfo();
  }

  async createMint(
    decimals: number,
    authority: Keypair = this.wallet.payer
  ): Promise<Token> {
    return Token.createMint(
      this.conn,
      authority,
      authority.publicKey,
      authority.publicKey,
      decimals,
      TOKEN_PROGRAM_ID
    );
  }

  async createNativeMint() {
    return new Token(
      this.conn,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID,
      this.wallet.payer
    );
  }

  // --------------------------------------- Token Acc / ATA

  async deserializeTokenAccount(
    mint: PublicKey,
    tokenAccount: PublicKey
  ): Promise<AccountInfo> {
    const token = await this.deserializeToken(mint);
    return token.getAccountInfo(tokenAccount);
  }

  async findATA(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint,
      owner
    );
  }

  async createAndFundATA(
    token: Token,
    owner: PublicKey,
    amount: BN
  ): Promise<PublicKey> {
    if (token.publicKey == NATIVE_MINT) {
      const account = await Token.createWrappedNativeAccount(
        this.conn,
        TOKEN_PROGRAM_ID,
        owner,
        this.wallet.payer,
        amount.toNumber()
      );
      return account;
    } else {
      const account = await token.createAssociatedTokenAccount(owner);
      if (amount.toNumber() > 0) {
        await token.mintTo(account, this.wallet.payer, [], amount.toNumber());
      }
      return account;
    }
  }

  async createMintAndFundATA(
    owner: PublicKey,
    amount: BN
  ): Promise<ITokenData> {
    const token = await this.createMint(0);
    const tokenAcc = await this.createAndFundATA(token, owner, amount);
    return {
      tokenMint: token.publicKey,
      tokenAcc,
      owner,
      token,
    } as ITokenData;
  }
}
