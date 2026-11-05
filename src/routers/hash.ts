import type { ShardRouter } from './types';

// MurmurHash3 (x86, 32-bit): fast, well-distributed, deterministic
export function murmur3(key: string, seed = 0): number {
  const data = Buffer.from(key, 'utf8');
  const len = data.length;
  const nblocks = len >> 2;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;

  for (let i = 0; i < nblocks; i++) {
    let k = data.readUInt32LE(i * 4);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  const tail = nblocks * 4;
  switch (len & 3) {
    case 3: k1 ^= data[tail + 2] << 16;
    case 2: k1 ^= data[tail + 1] << 8;
    case 1:
      k1 ^= data[tail];
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h ^= k1;
  }

  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class HashRouter implements ShardRouter {
  readonly name = 'hash';
  constructor(private n: number) {}

  getShard(key: string | number): number {
    return murmur3(String(key)) % this.n;
  }

  shardCount(): number {
    return this.n;
  }
}