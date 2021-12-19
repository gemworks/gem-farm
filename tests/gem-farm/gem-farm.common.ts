import { Keypair } from '@solana/web3.js';
import { stringifyPubkeysAndBNsInObject } from '../utils/types';

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
