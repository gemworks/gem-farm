/**
 * Utility for interacting with account data directly.
 *
 * Typically useful for mocking information being placed on-chain
 * by other programs, such as price oracles (e.g. Pyth).
 *
 * This depends on the associated `TestWriter` program, which can
 * process instructions to modify an account's data.
 */

import * as anchor from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";


const writer = anchor.workspace.TestWriter;

export class DataManager {
    static readonly programId = writer.programId;

    conn: Connection;
    wallet: Wallet;

    constructor(conn: Connection, wallet: Wallet) {
        this.conn = conn;
        this.wallet = wallet;
    }

    /**
     * Create a new account for storing arbitrary data
     * @param space The data size to reserve for this account
     * @returns The keypair for the created accounts.
     */
    async createAccount(space: number): Promise<Keypair> {
        const newAccount = Keypair.generate();
        const createTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: this.wallet.publicKey,
                newAccountPubkey: newAccount.publicKey,
                programId: writer.programId,
                lamports: await this.conn.getMinimumBalanceForRentExemption(
                    space
                ),
                space,
            })
        );

        await web3.sendAndConfirmTransaction(this.conn, createTx, [
            this.wallet.payer,
            newAccount,
        ]);
        return newAccount;
    }

    /**
     * Change the data stored in a configuration account
     * @param account The keypair for the account to modify
     * @param offset The starting offset of the section of the account data to modify.
     * @param input The data to store in the account
     */
    async store(account: Keypair, offset: number, input: Buffer) {
        const writeInstr = writer.instruction.write(
            new anchor.BN(offset),
            input,
            {
                accounts: { target: account.publicKey },
            }
        );
        const writeTx = new Transaction({
            feePayer: this.wallet.publicKey,
        }).add(writeInstr);

        await web3.sendAndConfirmTransaction(this.conn, writeTx, [
            account,
            this.wallet.payer,
        ]);
    }
}
