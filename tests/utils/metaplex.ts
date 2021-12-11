import { actions, programs, Wallet } from '@metaplex/js';
import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import { pause } from './types';

export async function createMetadata(
  connection: Connection,
  wallet: Wallet,
  editionMint: PublicKey,
  updateAuthority?: PublicKey
) {
  const metadataData = parseMetadata(
    readJSON('./tests/artifacts/testMetadata.json')
  );

  //add a verified creator, which MUST be the signer (ie the wallet), or the prog will error
  metadataData.creators!.push(
    new programs.metadata.Creator({
      address: wallet.publicKey.toBase58(),
      verified: true,
      share: 50,
    })
  );

  await actions.createMetadata({
    connection,
    wallet,
    editionMint,
    metadataData,
    updateAuthority,
  });

  //necessary for metadata to propagate, even on localnet
  await pause(2000);

  //verify metadata propagated successfully and is available
  const metadata = await programs.metadata.Metadata.getPDA(editionMint);
  const metadataAcc = await programs.metadata.Metadata.load(
    connection,
    metadata
  );

  console.log(`metadata at ${metadata.toBase58()} ok`);

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
