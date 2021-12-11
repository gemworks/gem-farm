import { actions, programs, Wallet } from '@metaplex/js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import { pause } from './types';

export async function createMetadata(
  connection: Connection,
  wallet: Wallet,
  editionMint: PublicKey,
  //NOTE 1: must cleanly divide 100
  //NOTE 2: max 5 (metaplex's constraint)
  totalCreatorsN: number = 5,
  //NOTE 1: starts from 1, not 0
  ourCreatorN: number = 1
) {
  const metadataData = parseMetadata(
    readJSON('./tests/artifacts/testMetadata.json')
  );

  //we insert as many creators as we'd like for testing, including our target creator
  for (let i = 0; i < totalCreatorsN; i++) {
    metadataData.creators!.push(
      new programs.metadata.Creator({
        address:
          i === ourCreatorN - 1
            ? wallet.publicKey.toBase58()
            : Keypair.generate().publicKey.toBase58(),
        verified: i === ourCreatorN - 1, //all of them NOT verified, except for target creator
        share: 100 / totalCreatorsN,
      })
    );
  }

  console.log(metadataData);

  await actions.createMetadata({
    connection,
    wallet,
    editionMint,
    metadataData,
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
