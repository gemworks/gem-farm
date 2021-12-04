import * as BL from "@solana/buffer-layout";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export class NumberField extends BL.Layout {
  constructor(property?: string) {
    super(24, property);
  }

  decode(b: Uint8Array, offset?: number): BN {
    const start = offset == undefined ? 0 : offset;
    const data = b.slice(start, start + this.span);

    return new BN(data);
  }

  encode(src: BN, b: Uint8Array, offset?: number): number {
    const start = offset == undefined ? 0 : offset;
    b.set(src.toArray(), start);

    return this.span;
  }
}

export class PubkeyField extends BL.Layout {
  constructor(property?: string) {
    super(32, property);
  }

  decode(b: Uint8Array, offset?: number): PublicKey {
    const start = offset == undefined ? 0 : offset;
    const data = b.slice(start, start + this.span);

    return new PublicKey(data);
  }

  encode(src: PublicKey, b: Uint8Array, offset?: number): number {
    const start = offset == undefined ? 0 : offset;
    b.set(src.toBytes(), start);

    return this.span;
  }
}

export function numberField(property?: string): NumberField {
    return new NumberField(property);
}

export function pubkeyField(property? :string): PubkeyField {
    return new PubkeyField(property);
}