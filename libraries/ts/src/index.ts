import { PublicKey } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";

export { JetClient } from "./client";
export { JetMarket, MarketFlags } from "./market";
export { JetReserve, ReserveConfig } from "./reserve";
export { JetUser } from "./user";

export const PLACEHOLDER_ACCOUNT = PublicKey.default;

// FIXME: this is probably different on devnet
export const DEX_ID = new PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

export const DEX_ID_DEVNET = new PublicKey(
  "DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY"
);

// FIXME: ???
export const JET_ID = new PublicKey(
  "JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU"
);

export type AmountUnits = { tokens: {} } | { depositNotes: {} } | { loanNotes: {} };

export class Amount {
  constructor(public units: AmountUnits, public value: anchor.BN) {}

  static tokens(amount: number | u64): Amount {
    return new Amount({ tokens: {} }, new anchor.BN(amount));
  }

  static depositNotes(amount: number | u64): Amount {
    return new Amount({ depositNotes: {} }, new anchor.BN(amount));
  }

  static loanNotes(amount: number | u64): Amount {
    return new Amount({ loanNotes: {} }, new anchor.BN(amount));
  }
}
