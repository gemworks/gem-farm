import { BN } from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

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

//todo haven't tested
export function BNtoString(obj: any): any {
  if (obj instanceof BN) {
    return obj.toString();
  } else if (typeof obj == 'object') {
    const bnObj = {};

    for (const field in obj) {
      // @ts-ignore
      bnObj[field] = BNtoString(obj[field]);
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

export function isKp(toCheck: PublicKey | Keypair) {
  return toCheck instanceof Keypair;
}

export function stringToBytes(str: string) {
  const myBuffer = [];
  const buffer = new Buffer(str);
  for (let i = 0; i < buffer.length; i++) {
    myBuffer.push(buffer[i]);
  }
  return myBuffer;
}

export function stringifyPubkeysAndBNsInObject(o: any): any {
  const newO = { ...o };
  for (const [k, v] of Object.entries(newO)) {
    if (v instanceof PublicKey) {
      newO[k] = v.toBase58();
    } else if (v instanceof BN) {
      newO[k] = v.toString();
    } else if (parseType(v) === 'array') {
      newO[k] = stringifyPubkeysAndBNInArray(v as any);
    } else if (parseType(v) === 'dict') {
      newO[k] = stringifyPubkeysAndBNsInObject(v);
    } else {
      newO[k] = v;
    }
  }
  return newO;
}

export function stringifyPubkeysAndBNInArray(a: any[]): any[] {
  const newA = [];
  for (const i of a) {
    if (i instanceof PublicKey) {
      newA.push(i.toBase58());
    } else if (i instanceof BN) {
      newA.push(i.toString());
    } else if (parseType(i) === 'array') {
      newA.push(stringifyPubkeysAndBNInArray(i));
    } else if (parseType(i) === 'dict') {
      newA.push(stringifyPubkeysAndBNsInObject(i));
    } else {
      newA.push(i);
    }
  }
  return newA;
}

export function parseType<T>(v: T): string {
  if (v === null || v === undefined) {
    return 'null';
  }
  if (typeof v === 'object') {
    if (v instanceof Array) {
      return 'array';
    }
    if (v instanceof Date) {
      return 'date';
    }
    return 'dict';
  }
  return typeof v;
}
