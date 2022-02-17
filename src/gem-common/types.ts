import { BN } from '@project-serum/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';

//todo need to write tests for functions in this file

export type Numerical = BN | number;

export function toBN(i: any): any {
  if (typeof i == 'number') {
    return new BN(i);
  } else if (i instanceof BN) {
    return i;
  } else if (parseType(i) === 'array') {
    const bnArray = [];

    for (const item in i) {
      bnArray.push(toBN(item));
    }

    return bnArray;
  } else if (parseType(i) === 'object') {
    const bnObj = {};

    for (const field in i) {
      // @ts-ignore
      bnObj[field] = toBN(i[field]);
    }

    return bnObj;
  }

  return i;
}

export function stringToBytes(str: string) {
  const myBuffer = [];
  const buffer = new Buffer(str);
  for (let i = 0; i < buffer.length; i++) {
    myBuffer.push(buffer[i]);
  }
  return myBuffer;
}

export function isKp(toCheck: PublicKey | Keypair) {
  return typeof (<Keypair>toCheck).publicKey !== 'undefined';
}

export function isPk(obj: any): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj['toBase58'] === 'function'
  );
}

export function stringifyPKsAndBNs(i: any): any {
  if (isPk(i)) {
    return (<PublicKey>i).toBase58();
  } else if (i instanceof BN) {
    return (<BN>i).toString();
  } else if (parseType(i) === 'array') {
    return stringifyPKsAndBNInArray(i);
  } else if (parseType(i) === 'object') {
    return stringifyPKsAndBNsInObject(i);
  }
  return i;
}

function stringifyPKsAndBNsInObject(o: any): any {
  const newO = { ...o };
  for (const [k, v] of Object.entries(newO)) {
    if (isPk(v)) {
      newO[k] = (<PublicKey>v).toBase58();
    } else if (v instanceof BN) {
      newO[k] = v.toString();
    } else if (parseType(v) === 'array') {
      newO[k] = stringifyPKsAndBNInArray(v as any);
    } else if (parseType(v) === 'object') {
      newO[k] = stringifyPKsAndBNsInObject(v);
    } else {
      newO[k] = v;
    }
  }
  return newO;
}

function stringifyPKsAndBNInArray(a: any[]): any[] {
  const newA = [];
  for (const i of a) {
    if (isPk(i)) {
      newA.push(i.toBase58());
    } else if (i instanceof BN) {
      newA.push(i.toString());
    } else if (parseType(i) === 'array') {
      newA.push(stringifyPKsAndBNInArray(i));
    } else if (parseType(i) === 'object') {
      newA.push(stringifyPKsAndBNs(i));
    } else {
      newA.push(i);
    }
  }
  return newA;
}

function parseType<T>(v: T): string {
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
    return 'object';
  }
  return typeof v;
}
