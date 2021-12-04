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
  MintInfo,
  NATIVE_MINT,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import { HasPublicKey, ToBytes, toPublicKeys } from './types';

export class TestToken extends Token {
  decimals: number;

  constructor(conn: Connection, token: Token, decimals: number) {
    super(conn, token.publicKey, token.programId, token.payer);
    this.decimals = decimals;
  }

  /**
   * Convert a token amount to the integer format for the mint
   * @param amount The amount of tokens
   */
  amount(amount: u64 | number): u64 {
    if (typeof amount == 'number') {
      amount = new u64(amount);
    }

    const one_unit = new u64(10).pow(new u64(this.decimals));
    return amount.mul(one_unit);
  }
}

export class AccountUtils {
  private conn: Connection;
  private wallet: Wallet;
  private authority: Keypair;
  private recentBlockhash: string;

  constructor(conn: Connection, funded: Wallet) {
    this.conn = conn;
    this.wallet = funded;
    this.authority = this.wallet.payer;
  }

  // --------------------------------------- passive

  payer(): Keypair {
    return this.wallet.payer;
  }

  connection(): Connection {
    return this.conn;
  }

  transaction(): Transaction {
    return new Transaction({
      feePayer: this.wallet.payer.publicKey,
      recentBlockhash: this.recentBlockhash,
    });
  }

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

  async deserializeTokenAccount(
    mintPk: PublicKey,
    tokenAccountPk: PublicKey
  ): Promise<AccountInfo> {
    const t = await this.deserializeToken(mintPk);
    return t.getAccountInfo(tokenAccountPk);
  }

  async deserializeTokenMint(mintPk: PublicKey): Promise<MintInfo> {
    const t = await this.deserializeToken(mintPk);
    return t.getMintInfo();
  }

  /**
   * Find a program derived address
   * @param programId The program the address is being derived for
   * @param seeds The seeds to find the address
   * @returns The address found and the bump seed required
   */
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

  // --------------------------------------- active

  async updateBlockhash() {
    this.recentBlockhash = (await this.conn.getRecentBlockhash()).blockhash;
  }

  /**
   * Create a new SPL token
   * @param decimals The number of decimals for the token.
   * @param authority The account with authority to mint/freeze tokens.
   * @returns The new token
   */
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

  /**
   * Create a new wallet with some initial funding.
   * @param lamports The amount of lamports to fund the wallet account with.
   * @returns The keypair for the new wallet.
   */
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

  /**
   * Create a new token account with some initial funding.
   * @param token The token to create an account for
   * @param owner The account that should own these tokens
   * @param amount The initial amount of tokens to provide as funding
   * @returns The address for the created account
   */
  async createTokenAccount(
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

  /*
   * Creates a mint with 0 decimals, a token account, and funds it with specified amount
   */
  async createAndFundTokenAcc(owner: PublicKey, amount: BN) {
    const token = await this.createToken(0);
    const mintAuth = (await token.getMintInfo()).mintAuthority;
    const tokenAcc = await this.createTokenAccount(token, owner, amount);
    return {
      tokenMint: token.publicKey,
      mintAuth,
      tokenAcc,
    };
  }

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
