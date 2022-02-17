import { PublicKey } from '@solana/web3.js';
import { GEM_BANK_PROG_ID } from '../index';

export const findVaultPDA = async (bank: PublicKey, creator: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('vault'), bank.toBytes(), creator.toBytes()],
    GEM_BANK_PROG_ID
  );
};

export const findGemBoxPDA = async (vault: PublicKey, mint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('gem_box'), vault.toBytes(), mint.toBytes()],
    GEM_BANK_PROG_ID
  );
};

export const findGdrPDA = async (vault: PublicKey, mint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('gem_deposit_receipt'), vault.toBytes(), mint.toBytes()],
    GEM_BANK_PROG_ID
  );
};

export const findVaultAuthorityPDA = async (vault: PublicKey) => {
  return PublicKey.findProgramAddress([vault.toBytes()], GEM_BANK_PROG_ID);
};

export const findWhitelistProofPDA = async (
  bank: PublicKey,
  whitelistedAddress: PublicKey
) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('whitelist'), bank.toBytes(), whitelistedAddress.toBytes()],
    GEM_BANK_PROG_ID
  );
};

export const findRarityPDA = async (bank: PublicKey, mint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('gem_rarity'), bank.toBytes(), mint.toBytes()],
    GEM_BANK_PROG_ID
  );
};
