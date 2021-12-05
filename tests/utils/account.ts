import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Signer,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { BN, Wallet } from '@project-serum/anchor';
import {
  AccountInfo,
  AccountLayout as TokenAccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintInfo,
  NATIVE_MINT,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import { HasPublicKey, ToBytes, toPublicKeys } from './types';

export interface ITokenData {
  tokenMint: PublicKey;
  tokenAcc: PublicKey;
  owner: PublicKey;
  token: TestToken;
}

export class TestToken extends Token {
  decimals: number;
  one_unit: u64;

  constructor(conn: Connection, token: Token, decimals: number) {
    super(conn, token.publicKey, token.programId, token.payer);
    this.decimals = decimals;
    this.one_unit = new u64(10).pow(new u64(this.decimals));
  }

  as_int(amount: u64 | number): u64 {
    if (typeof amount == 'number') {
      amount = new u64(amount);
    }
    return amount.mul(this.one_unit);
  }

  as_decimal(amount: u64 | number): u64 {
    if (typeof amount == 'number') {
      amount = new u64(amount);
    }
    return amount.div(this.one_unit);
  }
}

export class AccountUtils {
  conn: Connection;
  wallet: Wallet;
  authority: Keypair;
  recentBlockhash: string;

  constructor(conn: Connection, funded: Wallet) {
    this.conn = conn;
    this.wallet = funded;
    this.authority = this.wallet.payer;
  }

  transaction(): Transaction {
    return new Transaction({
      feePayer: this.wallet.payer.publicKey,
      recentBlockhash: this.recentBlockhash,
    });
  }

  async updateBlockhash() {
    this.recentBlockhash = (await this.conn.getRecentBlockhash()).blockhash;
  }

  // --------------------------------------- PDA

  async findProgramAddress(
    programId: PublicKey,
    seeds: (HasPublicKey | ToBytes | Uint8Array | string)[]
  ): Promise<[PublicKey, number]> {
    const seed_bytes = seeds.map((s) => {
      if (typeof s == 'string') {
        return Buffer.from(s);
      } else if ('publicKey' in s) {
        return s.publicKey.toBytes();
      } else if ('toBytes' in s) {
        return s.toBytes();
      } else {
        return s;
      }
    });
    return await PublicKey.findProgramAddress(seed_bytes, programId);
  }

  // --------------------------------------- Wallet

  async createWallet(lamports: number): Promise<Keypair> {
    const wallet = Keypair.generate();
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports,
      })
    );

    await this.sendAndConfirmTransaction(fundTx, [this.authority]);
    return wallet;
  }

  // --------------------------------------- Token / Mint

  async deserializeToken(mintPk: PublicKey): Promise<Token> {
    //doesn't matter which keypair goes here, we just need some key for instantiation
    const throwawayKp = Keypair.fromSecretKey(
      Uint8Array.from([
        208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199,
        242, 120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179,
        84, 137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242,
        57, 158, 226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249,
        157, 62, 80,
      ])
    );
    return new Token(this.conn, mintPk, TOKEN_PROGRAM_ID, throwawayKp);
  }

  async deserializeTokenMint(mintPk: PublicKey): Promise<MintInfo> {
    const t = await this.deserializeToken(mintPk);
    return t.getMintInfo();
  }

  async createToken(
    decimals: number,
    authority: PublicKey = this.authority.publicKey
  ): Promise<TestToken> {
    const token = await Token.createMint(
      this.conn,
      this.authority,
      authority,
      authority,
      decimals,
      TOKEN_PROGRAM_ID
    );
    return new TestToken(this.conn, token, decimals);
  }

  async createNativeToken() {
    const token = new Token(
      this.conn,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID,
      this.authority
    );
    return new TestToken(this.conn, token, 9);
  }

  // --------------------------------------- Token Acc / ATA

  async deserializeTokenAccount(
    mintPk: PublicKey,
    tokenAccountPk: PublicKey
  ): Promise<AccountInfo> {
    const token = await this.deserializeToken(mintPk);
    return token.getAccountInfo(tokenAccountPk);
  }

  async getATA(mintPk: PublicKey, ownerPk: PublicKey): Promise<PublicKey> {
    return Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mintPk,
      ownerPk
    );
  }

  async createAndFundATA(
    token: Token,
    owner: PublicKey | HasPublicKey,
    amount: BN
  ): Promise<PublicKey> {
    if ('publicKey' in owner) {
      owner = owner.publicKey;
    }

    if (token.publicKey == NATIVE_MINT) {
      const account = await Token.createWrappedNativeAccount(
        this.conn,
        TOKEN_PROGRAM_ID,
        owner,
        this.authority,
        amount.toNumber()
      );
      return account;
    } else {
      const account = await token.createAssociatedTokenAccount(owner);
      if (amount.toNumber() > 0) {
        await token.mintTo(account, this.authority, [], amount.toNumber());
      }
      return account;
    }
  }

  async createMintAndATA(owner: PublicKey, amount: BN): Promise<ITokenData> {
    const token = await this.createToken(0);
    const tokenAcc = await this.createAndFundATA(token, owner, amount);
    return {
      tokenMint: token.publicKey,
      tokenAcc,
      owner,
      token,
    } as ITokenData;
  }

  async createTokenAccountTx(
    token: Token,
    owner: PublicKey | HasPublicKey,
    amount: number
  ): Promise<[PublicKey, Transaction]> {
    if ('publicKey' in owner) {
      owner = owner.publicKey;
    }
    let lamportBalanceNeeded = await Token.getMinBalanceRentForExemptAccount(
      this.conn
    );
    if (token.publicKey == NATIVE_MINT) {
      lamportBalanceNeeded += amount;
    }
    const newAccount = Keypair.generate();
    const transaction = this.transaction().add(
      SystemProgram.createAccount(
        toPublicKeys({
          fromPubkey: this.wallet.payer,
          newAccountPubkey: newAccount,
          lamports: lamportBalanceNeeded,
          space: TokenAccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        })
      ),
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        token.publicKey,
        newAccount.publicKey,
        owner
      )
    );
    transaction.sign(newAccount);
    return [newAccount.publicKey, transaction];
  }

  // --------------------------------------- Tx

  async sendAndConfirmTransaction(
    transaction: Transaction,
    signers: Signer[]
  ): Promise<string> {
    return await sendAndConfirmTransaction(
      this.conn,
      transaction,
      signers.concat(this.wallet.payer)
    );
  }

  async sendAndConfirmTransactionSet(
    ...transactions: [Transaction, Signer[]][]
  ): Promise<string[]> {
    const signatures = await Promise.all(
      transactions.map(([t, s]) => this.conn.sendTransaction(t, s))
    );
    const result = await Promise.all(
      signatures.map((s) => this.conn.confirmTransaction(s))
    );

    const failedTx = result.filter((r) => r.value.err != null);

    if (failedTx.length > 0) {
      throw new Error(`Transactions failed: ${failedTx}`);
    }

    return signatures;
  }
}
