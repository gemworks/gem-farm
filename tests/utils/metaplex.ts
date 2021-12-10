import { actions, programs, Wallet } from '@metaplex/js';
import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

export async function createMetadata(
  connection: Connection,
  wallet: Wallet,
  editionMint: PublicKey,
  updateAuthority?: PublicKey
) {
  const metadataData = parseMetadata(
    readJSON('./tests/artifacts/testMetadata.json')
  );
  const txId = await actions.createMetadata({
    connection,
    wallet,
    editionMint,
    metadataData,
    updateAuthority,
  });
  const metadata = await programs.metadata.Metadata.getPDA(editionMint);
  console.log('Created Metadata:', txId, metadata.toBase58());
  return metadata;
}

export function readJSON(path: string) {
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
