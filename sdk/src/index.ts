import { PublicKey } from '@solana/web3.js';

export * from './gem-bank.client';
export * from './gem-farm.client';
export * from './gem-common';

export const GEM_BANK_PROG_ID = new PublicKey(
  'bankHHdqMuaaST4qQk6mkzxGeKPHWmqdgor6Gs8r88m'
);
export const GEM_FARM_PROG_ID = new PublicKey(
  'farmL4xeBFVXJqtfxCzU9b28QACM7E2W2ctT6epAjvE'
);
