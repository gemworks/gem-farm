import * as anchor from '@project-serum/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { AccountUtils, ITokenData } from './account-utils';
//@ts-ignore
import {
  createAssociatedTokenAccount,
  createMint,
  createWrappedNativeAccount, mintTo,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

export class NodeWallet extends AccountUtils {
  wallet: anchor.Wallet; //node wallet

  constructor(conn: Connection, wallet: anchor.Wallet) {
    super(conn);
    this.wallet = wallet;
  }

  async topUpWallet(lamports: number) {
    await this.conn.confirmTransaction(
      await this.conn.requestAirdrop(this.wallet.publicKey, lamports)
    );
  }

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

  // --------------------------------------- Mint

  async createMint(
    decimals: number,
    authority: Keypair = this.wallet.payer
  ): Promise<PublicKey> {
    return createMint(
      this.conn,
      authority,
      authority.publicKey,
      authority.publicKey,
      decimals,
    );
  }

  async createAndFundATA(
    token: PublicKey,
    owner: PublicKey,
    amount: BN
  ): Promise<PublicKey> {
    if (token == NATIVE_MINT) {
      const account = await createWrappedNativeAccount(
          this.conn,
          this.wallet.payer,
          owner,
          amount.toNumber()
      );
      return account;
    } else {
      const account = await createAssociatedTokenAccount(this.conn, this.wallet.payer, token, owner);
      if (amount.toNumber() > 0) {
        await mintTo(this.conn, this.wallet.payer, token, account, this.wallet.payer, amount.toNumber());
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
      tokenMint: token,
      tokenAcc,
      owner,
      token,
    } as ITokenData;
  }
}
