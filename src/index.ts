import { PublicKey } from '@solana/web3.js';

export * from './gem-bank';
export * from './gem-farm';
export * from './gem-common';

export const GEM_BANK_PROG_ID = new PublicKey(
  'BfVyiGiftx9ZTpzgjDBNKe56ie6aFCMuVRNFa15wo7Yp'
);
export const GEM_FARM_PROG_ID = new PublicKey(
  '4fiPCtdqvoZMkz99voSNpvatNSrm1adQiwkxYKt5NxyS'
);
