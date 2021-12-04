import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Shardd } from '../target/types/shardd';
import assert from 'assert';
import {SystemProgram} from "@solana/web3.js";

describe('core', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Shardd as Program<Shardd>;

  const shardrKp = anchor.web3.Keypair.generate();
  const masterKp = provider.wallet;

  it('inits shardr', async () => {
    const config = {
      maxCuratorFeePct: 100,
    } as any; //todo need proper interface

    await program.rpc.initShardr(config, {
      accounts: {
        shardr: shardrKp.publicKey,
        master: masterKp.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [shardrKp],
    });

    const shardrAcc = await program.account.shardr.fetch(shardrKp.publicKey);
    assert.equal(shardrAcc.master.toBase58(), masterKp.publicKey.toBase58());
    assert.equal(shardrAcc.config.maxCuratorFeePct, 100);
    assert.equal(shardrAcc.vaultCount, 0);
    assert.equal(shardrAcc.limits.minMinVotersForBuyoutPct, 25);

  });
});
