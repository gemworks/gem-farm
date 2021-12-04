import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { GemBank } from '../target/types/gem_bank';
import assert from 'assert';
import {SystemProgram} from "@solana/web3.js";

describe('gem bank', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GemBank as Program<GemBank>;

  const keeprKp = anchor.web3.Keypair.generate();
  const masterKp = provider.wallet;

  it('inits keepr', async () => {
    const config = {
      maxCuratorFeePct: 100,
    } as any; //todo need proper interface

    await program.rpc.initKeepr(config, {
      accounts: {
        keepr: keeprKp.publicKey,
        master: masterKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [keeprKp],
    });

    const keeprAcc = await program.account.keepr.fetch(keeprKp.publicKey);
    assert.equal(keeprAcc.master.toBase58(), masterKp.publicKey.toBase58());
    assert.equal(keeprAcc.config.maxCuratorFeePct, 100);
    assert.equal(keeprAcc.vaultCount, 0);
    assert.equal(keeprAcc.limits.minMinVotersForBuyoutPct, 25);

  });
});
