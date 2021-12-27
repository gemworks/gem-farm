import { PublicKey } from '@solana/web3.js';

export const DEFAULTS = {
  CLUSTER: 'devnet',
  //todo these need to be PER cluster
  GEM_BANK_PROG_ID: new PublicKey(
    '2Kezyz4zLTv8wDoD2t2KKsb76p5KTC3MjVpquoAxTY5V'
  ),
  GEM_FARM_PROG_ID: new PublicKey(
    '2VMTQBkVcwaYj2VJH1EB1hSa8bv8Dij5sCEtfWJMoFGK'
  ),
};
