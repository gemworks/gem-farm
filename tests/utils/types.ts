import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export interface ToBytes {
  toBytes(): Uint8Array;
}

export interface HasPublicKey {
  publicKey: PublicKey;
}

//todo missing arrays
/**
 * Convert some value/object to use `BN` type to represent numbers.
 *
 * If the value is a number, its converted to a `BN`. If the value is
 * an object, then each field is (recursively) converted to a `BN`.
 *
 * @param obj The value or object to convert.
 * @returns The object as a`BN`
 */
export function toBN(obj: any): any {
  if (typeof obj == 'number') {
    return new BN(obj);
  } else if (typeof obj == 'object') {
    const bnObj = {};

    for (const field in obj) {
      // @ts-ignore
      bnObj[field] = toBN(obj[field]);
    }

    return bnObj;
  }

  return obj;
}

//todo missing arrays
/**
 * Convert some object of fields with address-like values,
 * such that the values are converted to their `PublicKey` form.
 * @param obj The object to convert
 */
export function toPublicKeys(
  obj: Record<string, string | PublicKey | HasPublicKey | any>
): any {
  const newObj = {};

  for (const key in obj) {
    const value = obj[key];

    if (typeof value == 'string') {
      // @ts-ignore
      newObj[key] = new PublicKey(value);
    } else if (typeof value == 'object' && 'publicKey' in value) {
      // @ts-ignore
      newObj[key] = value.publicKey;
    } else {
      // @ts-ignore
      newObj[key] = value;
    }
  }

  return newObj;
}

//todo missing arrays
/**
 * Convert some object of fields with address-like values,
 * such that the values are converted to their base58 `PublicKey` form.
 * @param obj The object to convert
 */
export function toBase58(
  obj: Record<string, string | PublicKey | HasPublicKey>
): any {
  const newObj = {};

  for (const key in obj) {
    const value = obj[key];

    if (value == undefined) {
      continue;
    } else if (typeof value == 'string') {
      // @ts-ignore
      newObj[key] = value;
    } else if ('publicKey' in value) {
      // @ts-ignore
      newObj[key] = value.publicKey.toBase58();
    } else if ('toBase58' in value && typeof value.toBase58 == 'function') {
      // @ts-ignore
      newObj[key] = value.toBase58();
    } else {
      // @ts-ignore
      newObj[key] = value;
    }
  }

  return newObj;
}

export async function pause(ms: number) {
  await new Promise((response) =>
    setTimeout(() => {
      response(0);
    }, ms)
  );
}
