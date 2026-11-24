import type { ShardRouter } from './types';

// Contiguous id ranges: shard 0 owns the first slice, shard 1 the next, and so on.
// Ids beyond maxKey (new inserts) all fall into the LAST shard: the classic range hotspot.
export class RangeRouter implements ShardRouter {
  readonly name = 'range';
  private size: number;

  constructor(private n: number, maxKey = 1_000_000) {
    this.size = Math.ceil(maxKey / n);
  }

  getShard(key: string | number): number {
    const idx = Math.floor((Number(key) - 1) / this.size);
    return Math.min(Math.max(idx, 0), this.n - 1);
  }

  shardCount(): number {
    return this.n;
  }

  shardsForRange(from: number, to: number): number[] {
    const lo = this.getShard(from);
    const hi = this.getShard(to);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
}