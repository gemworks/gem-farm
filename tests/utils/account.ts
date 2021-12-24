import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
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
  MintLayout,
  NATIVE_MINT,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import {
  HasPublicKey,
  stringifyPubkeysAndBNsInObject,
  ToBytes,
  toPublicKeys,
} from './types';

export interface ITokenData {
  tokenMint: PublicKey;
  tokenAcc: PublicKey;
  owner: PublicKey;
  token: Token;
}

export interface TxWithSigners {
  tx: Transaction;
  signers: Signer[];
}

export class AccountUtils {
  conn: Connection;
  wallet: Wallet;

  constructor(conn: Connection, wallet: Wallet) {
    this.conn = conn;
    this.wallet = wallet;
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

  // --------------------------------------- Wallet / Keypair

  async createWallet(lamports: number): Promise<Keypair> {
    const wallet = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports,
      })
    );

    await this.sendAndConfirmTx({ tx, signers: [this.wallet.payer] });
    return wallet;
  }

  // --------------------------------------- Token / Mint

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

  async createToken(
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

  async createNativeToken() {
    return new Token(
      this.conn,
      NATIVE_MINT,
      TOKEN_PROGRAM_ID,
      this.wallet.payer
    );
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.conn.getBalance(publicKey);
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
    const token = await this.createToken(0);
    const tokenAcc = await this.createAndFundATA(token, owner, amount);
    return {
      tokenMint: token.publicKey,
      tokenAcc,
      owner,
      token,
    } as ITokenData;
  }

  async createMintAndFundATAWithWallet(
    wallet: Wallet,
    decimals: number,
    amount: number
  ) {
    //create mint
    const [mint, newMintTx] = await this.createMintTx(
      wallet.publicKey,
      wallet.publicKey,
      decimals
    );
    //create token ATA
    const [tokenAcc, newTokenAccTx] = await this.createTokenAccountTx(
      mint,
      wallet.publicKey,
      wallet.publicKey,
      true
    );
    //fund ATA
    const mintToTx = await this.mintToTx(
      mint,
      tokenAcc,
      wallet.publicKey,
      wallet.publicKey,
      amount
    );

    const tx = await this.mergeTxs(
      [newMintTx, newTokenAccTx, mintToTx],
      wallet.publicKey
    );
    const txSig = await this.sendTxWithWallet(wallet, tx);

    return { mint, tokenAcc, txSig };
  }

  async createMintTx(
    authority: PublicKey,
    payer: PublicKey,
    decimals: number
  ): Promise<[PublicKey, TxWithSigners]> {
    const mintAccount = Keypair.generate();
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(this.conn);
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: (await this.conn.getRecentBlockhash()).blockhash,
    });
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: authority,
        newAccountPubkey: mintAccount.publicKey,
        lamports: balanceNeeded,
        space: MintLayout.span,
        programId: TOKEN_PROGRAM_ID,
      }),
      Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        mintAccount.publicKey,
        decimals,
        authority,
        authority
      )
    );

    return [mintAccount.publicKey, { tx, signers: [mintAccount] }];
  }

  async createTokenAccountTx(
    mint: PublicKey,
    authority: PublicKey,
    payer: PublicKey,
    isAssociated: boolean
  ): Promise<[PublicKey, TxWithSigners]> {
    const newAccount = Keypair.generate();
    let balanceNeeded = await Token.getMinBalanceRentForExemptAccount(
      this.conn
    );
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: (await this.conn.getRecentBlockhash()).blockhash,
    });
    if (isAssociated) {
      const associatedAddress = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        authority
      );
      tx.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          mint,
          associatedAddress,
          authority,
          payer
        )
      );

      return [associatedAddress, { tx, signers: [] }];
    }
    tx.add(
      SystemProgram.createAccount(
        toPublicKeys({
          fromPubkey: authority,
          newAccountPubkey: newAccount,
          lamports: balanceNeeded,
          space: TokenAccountLayout.span,
          programId: TOKEN_PROGRAM_ID,
        })
      )
    );
    tx.add(
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        newAccount.publicKey,
        authority
      )
    );

    return [newAccount.publicKey, { tx, signers: [newAccount] }];
  }

  async mintToTx(
    mint: PublicKey,
    dest: PublicKey,
    authority: PublicKey,
    payer: PublicKey,
    amount: number,
  ): Promise<TxWithSigners> {
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: (await this.conn.getRecentBlockhash()).blockhash,
    });
    tx.add(
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        dest,
        authority,
        [],
        amount
      )
    );

    return { tx, signers: [] };
  }

  // --------------------------------------- Tx

  // ----------------- single

  async sendTxWithWallet(wallet: Wallet, tx: TxWithSigners) {
    await wallet.signTransaction(tx.tx);
    return this.sendAndConfirmTx(tx);
  }

  async sendAndConfirmTx(tx: TxWithSigners): Promise<string> {
    tx.signers.forEach((s) => {
      tx.tx.partialSign(s);
    });
    const txSig = await sendAndConfirmRawTransaction(
      this.conn,
      tx.tx.serialize()
    );
    console.log('success', txSig);
    return txSig;
  }

  // ----------------- multiple

  async mergeTxs(
    txs: TxWithSigners[],
    payer: PublicKey
  ): Promise<TxWithSigners> {
    const finalTx = new Transaction({
      feePayer: payer,
      recentBlockhash: (await this.conn.getRecentBlockhash()).blockhash,
    });
    let finalSigners: Signer[] = [];

    txs.forEach((t) => {
      finalTx.instructions.push(...t.tx.instructions);
      finalTx.signatures.push(...t.tx.signatures);
      finalSigners.push(...t.signers);
    });

    //dedup
    finalTx.signatures = [...new Set(finalTx.signatures)];
    finalSigners = [...new Set(finalSigners)];

    return { tx: finalTx, signers: finalSigners };
  }

  // (!) does NOT merge - will fail if one tx depends on another
  async sendTxsSetWithWallet(wallet: Wallet, txs: TxWithSigners[]) {
    await wallet.signAllTransactions(txs.map((t) => t.tx));
    return this.sendAndConfirmTxsSet(txs);
  }

  async sendAndConfirmTxsSet(txs: TxWithSigners[]): Promise<string[]> {
    console.log(`attempting to send ${txs.length} transactions`);
    const signatures = await Promise.all(
      txs.map((t) => this.sendAndConfirmTx(t))
    );
    const result = await Promise.all(
      signatures.map((s) => this.conn.confirmTransaction(s))
    );

    const failedTx = result.filter((r) => r.value.err != null);

    if (failedTx.length > 0) {
      throw new Error(`Transactions failed: ${failedTx}`);
    } else {
      console.log('All transactions succeeded:', signatures);
    }
    return signatures;
  }
}
