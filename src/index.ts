import { PublicKey } from '@solana/web3.js';

export * from './gem-bank';
export * from './gem-farm';
export * from './gem-common';

export const GEM_BANK_PROG_ID = new PublicKey(
  'DAAEGzczZTN83mz2WEg8NQQSVAaCKTViXvshUGGyjJyi'
);
export const GEM_FARM_PROG_ID = new PublicKey(
  'GohNJHF8oQnUpzdzS6qWBViJkg4Hv78CKWF8585KZW9V'
);
