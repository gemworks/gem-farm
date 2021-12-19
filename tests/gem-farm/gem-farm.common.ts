import { Keypair, PublicKey } from '@solana/web3.js';
import { stringifyPubkeysAndBNsInObject } from '../utils/types';
import { Token } from '@solana/spl-token';

export async function printStructsGeneric(
  gf: any,
  state: string,
  farm: Keypair,
  farmer1Identity: Keypair,
  farmer2Identity: Keypair
) {
  const farmAcc = await gf.fetchFarmAcc(farm.publicKey);
  console.log(`// --------------------------------------- ${state}`);
  console.log('// --------------------------------------- farm');
  console.log(stringifyPubkeysAndBNsInObject(farmAcc));

  const [farmer1] = await gf.findFarmerPDA(
    farm.publicKey,
    farmer1Identity.publicKey
  );
  const farmer1Acc = await gf.fetchFarmerAcc(farmer1);
  console.log('// --------------------------------------- farmer 1');
  console.log(stringifyPubkeysAndBNsInObject(farmer1Acc));

  const [farmer2] = await gf.findFarmerPDA(
    farm.publicKey,
    farmer2Identity.publicKey
  );
  const farmer2Acc = await gf.fetchFarmerAcc(farmer2);
  console.log('// --------------------------------------- farmer 2');
  console.log(stringifyPubkeysAndBNsInObject(farmer2Acc));
}

export function nameFromMintGeneric(
  rewardMint: PublicKey,
  rewardAMint: Token,
  rewardBMint: Token
) {
  if (rewardMint.toBase58() === rewardAMint.publicKey.toBase58()) {
    return 'rewardA';
  } else if (rewardMint.toBase58() === rewardBMint.publicKey.toBase58()) {
    return 'rewardB';
  } else {
    throw new Error('reward mint not recognized');
  }
}

export function mintFromNameGeneric(
  rewardName: string,
  rewardAMint: Token,
  rewardBMint: Token
) {
  if (rewardName === 'rewardA') {
    return rewardAMint.publicKey.toBase58();
  } else if (rewardName === 'rewardB') {
    return rewardBMint.publicKey.toBase58();
  } else {
    throw new Error('reward name not recognized');
  }
}
