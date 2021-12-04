/**
 * Utilities for writing integration tests
 *
 * @module
 */

import {BN, Wallet} from "@project-serum/anchor";
import {AccountLayout as TokenAccountLayout, NATIVE_MINT, Token, TOKEN_PROGRAM_ID, u64,} from "@solana/spl-token";
import {Connection, Keypair, PublicKey, sendAndConfirmTransaction, Signer, SystemProgram, Transaction,} from "@solana/web3.js";

interface ToBytes {
    toBytes(): Uint8Array;
}

interface HasPublicKey {
    publicKey: PublicKey;
}

export class TestUtils {
    private conn: Connection;
    private wallet: Wallet;
    private authority: Keypair;
    private recentBlockhash: string;

    constructor(conn: Connection, funded: Wallet) {
        this.conn = conn;
        this.wallet = funded;
        this.authority = this.wallet.payer;
    }

    async updateBlockhash() {
        this.recentBlockhash = (await this.conn.getRecentBlockhash()).blockhash;
    }

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
        if ("publicKey" in owner) {
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
            const account = await token.createAccount(owner);
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
        if ("publicKey" in owner) {
            owner = owner.publicKey;
        }

        let lamportBalanceNeeded =
            await Token.getMinBalanceRentForExemptAccount(this.conn);

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
            if (typeof s == "string") {
                return Buffer.from(s);
            } else if ("publicKey" in s) {
                return s.publicKey.toBytes();
            } else if ("toBytes" in s) {
                return s.toBytes();
            } else {
                return s;
            }
        });
        return await PublicKey.findProgramAddress(seed_bytes, programId);
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
            transactions.map(([t, s]) =>
                this.conn.sendTransaction(t, s)
            )
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

//todo missing arrays
/**
 * Convert some value/object to use `BN` type to represent numbers.
 *
 * If the value is a number, its converted to a `BN`. If the value is
 * an object, then each field is (recursively) converted to a `BN`.
 *
 * @param obj The value or object to convert.
 * @returns The object as a`BN`
 */
export function toBN(obj: any): any {
    if (typeof obj == "number") {
        return new BN(obj);
    } else if (typeof obj == "object") {
        const bnObj = {};

        for (const field in obj) {
            bnObj[field] = toBN(obj[field]);
        }

        return bnObj;
    }

    return obj;
}

//todo missing arrays
/**
 * Convert some object of fields with address-like values,
 * such that the values are converted to their `PublicKey` form.
 * @param obj The object to convert
 */
export function toPublicKeys(
    obj: Record<string, string | PublicKey | HasPublicKey | any>
): any {
    const newObj = {};

    for (const key in obj) {
        const value = obj[key];

        if (typeof value == "string") {
            newObj[key] = new PublicKey(value);
        } else if (typeof value == "object" && "publicKey" in value) {
            newObj[key] = value.publicKey;
        } else {
            newObj[key] = value;
        }
    }

    return newObj;
}

//todo missing arrays
/**
 * Convert some object of fields with address-like values,
 * such that the values are converted to their base58 `PublicKey` form.
 * @param obj The object to convert
 */
export function toBase58(
    obj: Record<string, string | PublicKey | HasPublicKey>
): any {
    const newObj = {};

    for (const key in obj) {
        const value = obj[key];

        if (value == undefined) {
            continue;
        } else if (typeof value == "string") {
            newObj[key] = value;
        } else if ("publicKey" in value) {
            newObj[key] = value.publicKey.toBase58();
        } else if ("toBase58" in value && typeof value.toBase58 == "function") {
            newObj[key] = value.toBase58();
        } else {
            newObj[key] = value;
        }
    }

    return newObj;
}

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
        if (typeof amount == "number") {
            amount = new u64(amount);
        }

        const one_unit = new u64(10).pow(new u64(this.decimals));
        return amount.mul(one_unit);
    }
}


