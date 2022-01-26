import { PublicKey } from '@solana/web3.js';

export const DEFAULTS = {
  CLUSTER: 'devnet',
  //todo these need to be PER cluster
  GEM_BANK_PROG_ID: new PublicKey(
    'niieYBwuo5ECxmy1iCv2fwGNkEdbbn87LekDbaCt1fZ'
  ),
  GEM_FARM_PROG_ID: new PublicKey(
    '9t5fVc99hmFP3k3gKd2NaBE6kxUuRLxwCssBxvoCXHMg'
  ),
};

//9t5fVc99hmFP3k3gKd2NaBE6kxUuRLxwCssBxvoCXHMg