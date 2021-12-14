import { BN } from '@project-serum/anchor';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { GemFarmClient } from '../gem-farm/gem-farm.client';
import { GemBankClient } from '../gem-bank/gem-bank.client';

export async function prepGem(
  g: GemBankClient | GemFarmClient,
  owner?: Keypair
) {
  const gemAmount = new BN(Math.ceil(Math.random() * 100));
  const gemOwner = owner ?? (await g.createWallet(100 * LAMPORTS_PER_SOL));
  const gem = await g.createMintAndATA(gemOwner.publicKey, gemAmount);

  return { gemAmount, gemOwner, gem };
}
