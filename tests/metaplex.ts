import { actions, programs, Wallet } from '@metaplex/js';
import { Connection, Keypair, PublicKey, sendAndConfirmRawTransaction, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import fs from 'fs';
import { pause } from '../src';
import { createCreateMetadataAccountV3Instruction, DataV2, Creator } from '@metaplex-foundation/mpl-token-metadata';

export async function createMetadata(
  connection: Connection,
  wallet: Wallet,
  editionMint: PublicKey,
  //must cleanly divide 100
  //max 5 (metaplex's constraint)
  totalCreatorsN: number = 5,
  //starts from 1, not 0
  ourCreatorN: number = 1,
  //leave our creator unverified for negatives testing
  leaveUnverified: boolean = false,
  //skips our creator entirely for negatives testing
  skipEntirely: boolean = false
) {
  const metadataData = parseMetadataV2(
    readJSON('./tests/artifacts/testMetadata.json')
  );

  //we insert as many creators as we'd like for testing, including our target creator
  for (let i = 0; i < totalCreatorsN; i++) {
    metadataData.creators!.push(
      {
        address:
          !skipEntirely && i === ourCreatorN - 1
            ? wallet.publicKey
            : Keypair.generate().publicKey,
        verified: !leaveUnverified && i === ourCreatorN - 1, //all of them NOT verified, except for target creator
        share: 100 / totalCreatorsN,
      }
    );
  }

  const metadata = await programs.metadata.Metadata.getPDA(editionMint);

  const ix = createCreateMetadataAccountV3Instruction({
    metadata: metadata,
    mint: editionMint,
    mintAuthority: wallet.publicKey,
    payer: wallet.publicKey,
    updateAuthority: wallet.publicKey
  }, {
    createMetadataAccountArgsV3: {
      data: metadataData,
      isMutable: false,
      collectionDetails: null
    }
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  const signedTx = await wallet.signTransaction(tx);
  const txid = await sendAndConfirmRawTransaction(connection, signedTx.serialize());
  console.log(`txid: ${txid}`);

  //necessary for metadata to propagate, even on localnet
  await pause(2000);

  //verify metadata propagated successfully and is available
  const metadataAcc = await programs.metadata.Metadata.load(
    connection,
    metadata
  );

  console.log(`metadata at ${metadata.toBase58()} ok`);

  return metadata;
}

function readJSON(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function parseMetadata(jsonMetadata: any) {
  return new programs.metadata.MetadataDataData({
    name: jsonMetadata.name,
    symbol: jsonMetadata.symbol,
    uri: jsonMetadata.uri,
    sellerFeeBasisPoints: jsonMetadata.sellerFeeBasisPoints,
    creators: jsonMetadata.creators.map(
      (c: any) =>
        new programs.metadata.Creator({
          address: c.address,
          verified: c.verified,
          share: c.share,
        })
    ),
  });
}

function parseMetadataV2(jsonMetadata: any): DataV2 {
  return {
    name: jsonMetadata.name,
    symbol: jsonMetadata.symbol,
    uri: jsonMetadata.uri,
    sellerFeeBasisPoints: jsonMetadata.sellerFeeBasisPoints,
    creators: jsonMetadata.creators,
    collection: null,
    uses: null,
  }
}
