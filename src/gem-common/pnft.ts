import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Commitment,
  ComputeBudgetProgram,
  ConfirmOptions,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  keypairIdentity,
  KeypairIdentityDriver,
  Metaplex,
  toBigNumber,
  walletAdapterIdentity,
} from '@metaplex-foundation/js';
import {
  createCreateInstruction,
  CreateInstructionAccounts,
  CreateInstructionArgs,
  createMintInstruction,
  MintInstructionAccounts,
  MintInstructionArgs,
  PROGRAM_ID as TMETA_PROG_ID,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata/';
import {
  createCreateOrUpdateInstruction,
  Payload,
  PREFIX,
  PROGRAM_ID as AUTH_PROG_ID,
} from '@metaplex-foundation/mpl-token-auth-rules';
import { AnchorProvider } from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { encode } from '@msgpack/msgpack';
import { BaseWalletAdapter } from '@solana/wallet-adapter-base';
import { backOff } from 'exponential-backoff';
import { GEM_BANK_PROG_ID } from '../index';

export const fetchNft = async (conn: Connection, mint: PublicKey) => {
  const mplex = new Metaplex(conn);
  return await mplex
    .nfts()
    .findByMint({ mintAddress: mint, loadJsonMetadata: true });
};

export const findTokenRecordPDA = async (mint: PublicKey, token: PublicKey) => {
  return PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TMETA_PROG_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('token_record'),
      token.toBuffer(),
    ],
    TMETA_PROG_ID
  );
};

export const findRuleSetPDA = async (payer: PublicKey, name: string) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from(PREFIX), payer.toBuffer(), Buffer.from(name)],
    AUTH_PROG_ID
  );
};

type BuildAndSendTxArgs = {
  provider: AnchorProvider;
  ixs: TransactionInstruction[];
  extraSigners?: Signer[];
  opts?: ConfirmOptions;
  // Prints out transaction (w/ logs) to stdout
  debug?: boolean;
  // Optional, if present signify that a V0 tx should be sent
  lookupTableAccounts?: [AddressLookupTableAccount] | undefined;
  v0SignKeypair?: Keypair;
  v0SignCallback?: (tx: any) => any;
};

//simplified version from tensor-common
const _buildTx = async ({
  connections,
  feePayer,
  instructions,
  additionalSigners,
  commitment = 'confirmed',
}: {
  //(!) ideally this should be the same RPC node that will then try to send/confirm the tx
  connections: Array<Connection>;
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  additionalSigners?: Array<Signer>;
  commitment?: Commitment;
}) => {
  if (!instructions.length) {
    throw new Error('must pass at least one instruction');
  }

  const tx = new Transaction();
  tx.add(...instructions);
  tx.feePayer = feePayer;

  const latestBlockhash = await connections[0].getLatestBlockhash({
    commitment,
  });
  tx.recentBlockhash = latestBlockhash.blockhash;
  const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

  if (additionalSigners) {
    additionalSigners
      .filter((s): s is Signer => s !== undefined)
      .forEach((kp) => {
        tx.partialSign(kp);
      });
  }

  return { tx, lastValidBlockHeight };
};

//simplified version from tensor-common
const _buildTxV0 = async ({
  connections,
  feePayer,
  instructions,
  additionalSigners,
  commitment = 'confirmed',
  addressLookupTableAccs,
}: {
  //(!) ideally this should be the same RPC node that will then try to send/confirm the tx
  connections: Array<Connection>;
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  additionalSigners?: Array<Signer>;
  commitment?: Commitment;
  addressLookupTableAccs: AddressLookupTableAccount[];
}) => {
  if (!instructions.length) {
    throw new Error('must pass at least one instruction');
  }

  const latestBlockhash = await connections[0].getLatestBlockhash({
    commitment,
  });
  const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

  const msg = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccs);
  const tx = new VersionedTransaction(msg);

  if (additionalSigners) {
    tx.sign(additionalSigners.filter((s): s is Signer => s !== undefined));
  }

  return { tx, lastValidBlockHeight };
};

export const buildAndSendTx = async ({
  provider,
  ixs,
  extraSigners,
  opts,
  debug,
  lookupTableAccounts,
  v0SignKeypair,
  v0SignCallback,
}: BuildAndSendTxArgs) => {
  let tx: Transaction | VersionedTransaction;

  if (!lookupTableAccounts?.length) {
    //build legacy
    ({ tx } = await backOff(
      () =>
        _buildTx({
          connections: [provider.connection],
          instructions: ixs,
          additionalSigners: extraSigners,
          feePayer: provider.publicKey,
        }),
      {
        // Retry blockhash errors (happens during tests sometimes).
        retry: (e: any) => {
          return e.message.includes('blockhash');
        },
      }
    ));
    await provider.wallet.signTransaction(tx);
  } else {
    //build v0
    ({ tx } = await backOff(
      () =>
        _buildTxV0({
          connections: [provider.connection],
          instructions: ixs,
          //have to add TEST_KEYPAIR here instead of wallet.signTx() since partialSign not impl on v0 txs
          additionalSigners: [
            ...(v0SignKeypair ? [v0SignKeypair] : []),
            ...(extraSigners ?? []),
          ],
          feePayer: provider.publicKey,
          addressLookupTableAccs: lookupTableAccounts,
        }),
      {
        // Retry blockhash errors (happens during tests sometimes).
        retry: (e: any) => {
          return e.message.includes('blockhash');
        },
      }
    ));
    if (v0SignCallback) {
      await v0SignCallback(tx);
    }
  }

  try {
    if (debug) opts = { ...opts, commitment: 'confirmed' };
    const sig = await provider.connection.sendRawTransaction(
      tx.serialize(),
      opts
    );
    await provider.connection.confirmTransaction(sig, 'confirmed');
    if (debug) {
      console.log(
        await provider.connection.getTransaction(sig, {
          commitment: 'confirmed',
        })
      );
    }
    return sig;
  } catch (e) {
    //this is needed to see program error logs
    console.error('❌ FAILED TO SEND TX, FULL ERROR: ❌');
    console.error(e);
    throw e;
  }
};

export const getTotalComputeIxs = (
  compute: number,
  priorityMicroLamports = 1
) => {
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: compute,
  });
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityMicroLamports,
  });
  return [modifyComputeUnits, addPriorityFee];
};

const _createFundedWallet = async (
  provider: AnchorProvider,
  sol: number = 1000
): Promise<Keypair> => {
  const keypair = Keypair.generate();
  //airdrops are funky, best to move from provider wallet
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.publicKey,
      toPubkey: keypair.publicKey,
      lamports: sol * LAMPORTS_PER_SOL,
    })
  );
  await buildAndSendTx({ provider, ixs: tx.instructions });
  return keypair;
};

export type CreatorInput = {
  address: PublicKey;
  share: number;
  authority?: Signer;
};

const _createAndMintPNft = async ({
  provider,
  owner,
  mint,
  royaltyBps,
  creators,
  collection,
  collectionVerified = true,
  ruleSet = null,
}: {
  provider: AnchorProvider;
  owner: Keypair;
  mint: Keypair;
  royaltyBps?: number;
  creators?: CreatorInput[];
  collection?: Keypair;
  collectionVerified?: boolean;
  ruleSet?: PublicKey | null;
}) => {
  // --------------------------------------- create

  // metadata account
  const [metadata] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TMETA_PROG_ID.toBuffer(),
      mint.publicKey.toBuffer(),
    ],
    TMETA_PROG_ID
  );

  // master edition account
  const [masterEdition] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TMETA_PROG_ID.toBuffer(),
      mint.publicKey.toBuffer(),
      Buffer.from('edition'),
    ],
    TMETA_PROG_ID
  );

  const accounts: CreateInstructionAccounts = {
    metadata,
    masterEdition,
    mint: mint.publicKey,
    authority: owner.publicKey,
    payer: owner.publicKey,
    splTokenProgram: TOKEN_PROGRAM_ID,
    sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    updateAuthority: owner.publicKey,
  };

  const args: CreateInstructionArgs = {
    createArgs: {
      __kind: 'V1',
      assetData: {
        name: 'Whatever',
        symbol: 'TSR',
        uri: 'https://www.tensor.trade',
        sellerFeeBasisPoints: royaltyBps ?? 0,
        creators:
          creators?.map((c) => {
            return {
              address: c.address,
              share: c.share,
              verified: false, //done manually below
            };
          }) ?? null,
        primarySaleHappened: true,
        isMutable: true,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        collection: collection
          ? { verified: collectionVerified, key: collection.publicKey }
          : null,
        uses: null,
        collectionDetails: null,
        ruleSet,
      },
      decimals: 0,
      printSupply: { __kind: 'Zero' },
    },
  };

  const createIx = createCreateInstruction(accounts, args);

  // this test always initializes the mint, we we need to set the
  // account to be writable and a signer
  for (let i = 0; i < createIx.keys.length; i++) {
    if (createIx.keys[i].pubkey.toBase58() === mint.publicKey.toBase58()) {
      createIx.keys[i].isSigner = true;
      createIx.keys[i].isWritable = true;
    }
  }

  // --------------------------------------- mint

  // mint instrution will initialize a ATA account
  const [tokenPda] = await PublicKey.findProgramAddress(
    [
      owner.publicKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.publicKey.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const [tokenRecord] = await findTokenRecordPDA(mint.publicKey, tokenPda);

  const mintAcccounts: MintInstructionAccounts = {
    token: tokenPda,
    tokenOwner: owner.publicKey,
    metadata,
    masterEdition,
    tokenRecord,
    mint: mint.publicKey,
    payer: owner.publicKey,
    authority: owner.publicKey,
    sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    splTokenProgram: TOKEN_PROGRAM_ID,
    authorizationRules: ruleSet ?? undefined,
    authorizationRulesProgram: AUTH_PROG_ID,
  };

  const payload: Payload = {
    map: new Map(),
  };

  const mintArgs: MintInstructionArgs = {
    mintArgs: {
      __kind: 'V1',
      amount: 1,
      authorizationData: {
        payload: payload as any,
      },
    },
  };

  const mintIx = createMintInstruction(mintAcccounts, mintArgs);

  // --------------------------------------- send

  await buildAndSendTx({
    provider,
    ixs: [createIx, mintIx],
    extraSigners: [owner, mint],
  });

  //manually verify creators (auto doesn't work)
  const creatorSigners = creators
    .map((c) => c.authority)
    .filter((s): s is Keypair => !!s);
  const metaplex = new Metaplex(provider.connection);
  await Promise.all(
    creatorSigners.map(async (s) => {
      await metaplex
        .use(keypairIdentity(s))
        .nfts()
        .verifyCreator({ mintAddress: mint.publicKey, creator: s });
    })
  );

  return {
    tokenAddress: tokenPda,
    metadataAddress: metadata,
    masterEditionAddress: masterEdition,
  };
};

export const createAndFundATA = async ({
  provider,
  owner,
  mint,
  royaltyBps,
  creators,
  collection,
  collectionVerified,
  programmable = false,
  ruleSetAddr,
}: {
  provider: AnchorProvider;
  owner?: Keypair;
  mint?: Keypair;
  royaltyBps?: number;
  creators?: CreatorInput[];
  collection?: Keypair;
  collectionVerified?: boolean;
  programmable?: boolean;
  ruleSetAddr?: PublicKey;
}): Promise<{
  mint: PublicKey;
  ata: PublicKey;
  owner: Keypair;
  metadata: PublicKey;
  masterEdition: PublicKey;
}> => {
  const usedOwner = owner ?? (await _createFundedWallet(provider));
  const usedMint = mint ?? Keypair.generate();

  const mplex = new Metaplex(provider.connection).use(
    keypairIdentity(usedOwner)
  );

  //create a verified collection
  if (collection) {
    await mplex.nfts().create({
      useNewMint: collection,
      tokenOwner: usedOwner.publicKey,
      uri: 'https://www.tensor.trade',
      name: 'Whatever',
      sellerFeeBasisPoints: royaltyBps ?? 0,
      isCollection: true,
      collectionIsSized: true,
    });

    // console.log(
    //   "coll",
    //   await mplex.nfts().findByMint({ mintAddress: collection.publicKey })
    // );
  }

  let metadataAddress, tokenAddress, masterEditionAddress;
  if (programmable) {
    //create programmable nft
    ({ metadataAddress, tokenAddress, masterEditionAddress } =
      await _createAndMintPNft({
        provider,
        mint: usedMint,
        owner: usedOwner,
        royaltyBps,
        creators,
        collection,
        collectionVerified,
        ruleSet: ruleSetAddr,
      }));
  } else {
    //create normal nft
    ({ metadataAddress, tokenAddress, masterEditionAddress } = await mplex
      .nfts()
      .create({
        useNewMint: usedMint,
        tokenOwner: usedOwner.publicKey,
        uri: 'https://www.tensor.trade',
        name: 'Whatever',
        sellerFeeBasisPoints: royaltyBps ?? 0,
        creators,
        maxSupply: toBigNumber(1),
        collection: collection?.publicKey,
      }));

    if (collection && collectionVerified) {
      await mplex.nfts().verifyCollection({
        mintAddress: usedMint.publicKey,
        collectionMintAddress: collection.publicKey,
      });
    }
  }

  // console.log(
  //   "nft",
  //   await mplex.nfts().findByMint({ mintAddress: usedMint.publicKey })
  // );

  return {
    mint: usedMint.publicKey,
    ata: tokenAddress,
    owner: usedOwner,
    metadata: metadataAddress,
    masterEdition: masterEditionAddress,
  };
};

export const createTokenAuthorizationRules = async (
  provider: AnchorProvider,
  payer: Keypair,
  name = 'a', //keep it short or we wont have space for tx to pass
  data?: Uint8Array
) => {
  const [ruleSetAddress] = await findRuleSetPDA(payer.publicKey, name);

  //ruleset relevant for transfers
  const ruleSet = {
    libVersion: 1,
    ruleSetName: name,
    owner: Array.from(payer.publicKey.toBytes()),
    operations: {
      'Delegate:Transfer': {
        ProgramOwnedList: {
          programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
          field: 'Delegate',
        },
      },
      'Transfer:Owner': {
        All: {
          rules: [
            //no space
            // {
            //   Amount: {
            //     amount: 1,
            //     operator: "Eq",
            //     field: "Amount",
            //   },
            // },
            {
              Any: {
                rules: [
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Source',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Destination',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Authority',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      'Transfer:TransferDelegate': {
        All: {
          rules: [
            //no space
            // {
            //   Amount: {
            //     amount: 1,
            //     operator: "Eq",
            //     field: "Amount",
            //   },
            // },
            {
              Any: {
                rules: [
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Source',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Destination',
                    },
                  },
                  {
                    ProgramOwnedList: {
                      programs: [Array.from(GEM_BANK_PROG_ID.toBytes())],
                      field: 'Authority',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };

  // Encode the file using msgpack so the pre-encoded data can be written directly to a Solana program account
  let finalData = data ?? encode(ruleSet);

  let createIX = createCreateOrUpdateInstruction(
    {
      payer: payer.publicKey,
      ruleSetPda: ruleSetAddress,
      systemProgram: SystemProgram.programId,
    },
    {
      createOrUpdateArgs: { __kind: 'V1', serializedRuleSet: finalData },
    },
    AUTH_PROG_ID
  );

  await buildAndSendTx({ provider, ixs: [createIX], extraSigners: [payer] });

  return ruleSetAddress;
};

export const createCoreGemLUT = async (provider: AnchorProvider) => {
  //intentionally going for > confirmed, otherwise get "is not a recent slot err"
  const slot = await provider.connection.getSlot('finalized');

  //create
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: provider.publicKey,
      payer: provider.publicKey,
      recentSlot: slot,
    });

  //see if already created
  let lookupTableAccount = (
    await provider.connection.getAddressLookupTable(lookupTableAddress)
  ).value;
  if (!!lookupTableAccount) {
    console.log('table already exists', lookupTableAddress.toBase58());
    return lookupTableAccount;
  }

  console.log('creating fresh lut');

  //add addresses
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: provider.publicKey,
    authority: provider.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
      TOKEN_PROGRAM_ID,
      SystemProgram.programId,
      SYSVAR_RENT_PUBKEY,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      AUTH_PROG_ID,
      TMETA_PROG_ID,
      SYSVAR_INSTRUCTIONS_PUBKEY,
    ],
  });
  await buildAndSendTx({ provider, ixs: [lookupTableInst, extendInstruction] });

  //fetch
  lookupTableAccount = (
    await provider.connection.getAddressLookupTable(lookupTableAddress)
  ).value;

  return lookupTableAccount;
};
