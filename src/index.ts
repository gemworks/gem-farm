import { PublicKey } from '@solana/web3.js';

export * from './gem-bank';
export * from './gem-farm';
export * from './gem-common';

export const GEM_BANK_PROG_ID = new PublicKey(
  'Ee5s23sQ7k4RkAZ6zaTuaCdVkAAGwfsd5r1naH25LUeW'
);
export const GEM_FARM_PROG_ID = new PublicKey(
  '8ptT7jx1XqLfTYAES4bj5MzhvoXji4vaBNce6KreLeFr'
);
