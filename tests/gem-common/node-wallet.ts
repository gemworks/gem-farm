import { Connection } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';

export class NodeWallet {
  conn: Connection;
  wallet: Wallet; //node wallet

  constructor(conn: Connection, wallet: Wallet) {
    this.conn = conn;
    this.wallet = wallet;
  }
}
