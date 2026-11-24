import { murmur3 } from './hash';
import type { ShardRouter } from './types';

// A lookup table maps each bucket of ids to a shard (the "directory").
// Seeded buckets are placed round-robin. Unknown buckets (new inserts) fall back to a hash.
// moveBucket() shows the strategy's main strength: you can relocate any slice on demand.
// The table is built deterministically from config, so every API process agrees.
// In production it would live in a database or Redis and be cached.
export class DirectoryRouter implements ShardRouter {
  readonly name = 'directory';
  private table = new Map<number, number>(); // bucket -> shard

  constructor(
    private n: number,
    private bucketSize = 1000,
    seededMaxKey = 1_000_000
  ) {
    const buckets = Math.floor(seededMaxKey / bucketSize) + 1;
    for (let b = 0; b < buckets; b++) this.table.set(b, b % n);
  }

  getShard(key: string | number): number {
    const bucket = Math.floor(Number(key) / this.bucketSize);
    const hit = this.table.get(bucket);
    if (hit !== undefined) return hit;
    return murmur3(String(bucket)) % this.n;
  }


  shardsForRange(from: number, to: number): number[] {
    const b0 = Math.floor(from / this.bucketSize);
    const b1 = Math.floor(to / this.bucketSize);
    if (b1 - b0 > 10_000) return Array.from({ length: this.n }, (_, i) => i); // too wide to enumerate
    const out = new Set<number>();
    for (let b = b0; b <= b1; b++) {
      out.add(this.table.get(b) ?? murmur3(String(b)) % this.n);
    }
    return [...out];
  }

  
  moveBucket(bucket: number, shard: number): void {
    this.table.set(bucket, shard);
  }

  shardCount(): number {
    return this.n;
  }
}