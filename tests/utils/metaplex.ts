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
  //we need to make sure the signer is passed in as creator
  metadataData.creators!.push(
    new programs.metadata.Creator({
      address: wallet.publicKey.toBase58(),
      verified: true,
      share: 50,
    })
  );

  console.log('prepared data', metadataData);

  const txId = await actions.createMetadata({
    connection,
    wallet,
    editionMint,
    metadataData,
    updateAuthority,
  });

  console.log('pausing');
  await pause(2000); //necessary for metadata to propagate, even on localnet

  const metadata = await programs.metadata.Metadata.getPDA(editionMint);
  console.log('Created Metadata:', txId, metadata.toBase58());

  const m = await programs.metadata.Metadata.load(connection, metadata);
  console.log(m);
  console.log('creators:', m.data.data.creators);

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
