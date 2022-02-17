import { PublicKey } from '@solana/web3.js';
import { GEM_FARM_PROG_ID } from '../index';

export const findFarmerPDA = async (farm: PublicKey, identity: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('farmer'), farm.toBytes(), identity.toBytes()],
    GEM_FARM_PROG_ID
  );
};

export const findFarmAuthorityPDA = async (farm: PublicKey) => {
  return PublicKey.findProgramAddress([farm.toBytes()], GEM_FARM_PROG_ID);
};

export const findFarmTreasuryPDA = (farm: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('treasury'), farm.toBytes()],
    GEM_FARM_PROG_ID
  );
};

export const findAuthorizationProofPDA = (
  farm: PublicKey,
  funder: PublicKey
) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('authorization'), farm.toBytes(), funder.toBytes()],
    GEM_FARM_PROG_ID
  );
};

export const findRewardsPotPDA = (farm: PublicKey, rewardMint: PublicKey) => {
  return PublicKey.findProgramAddress(
    [Buffer.from('reward_pot'), farm.toBytes(), rewardMint.toBytes()],
    GEM_FARM_PROG_ID
  );
};
