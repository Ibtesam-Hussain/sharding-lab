import { murmur3 } from './hash';
import type { ShardRouter } from './types';

interface RingPoint { point: number; shard: number }

export class ConsistentHashRouter implements ShardRouter {
  readonly name = 'consistent';
  private ring: RingPoint[] = [];
  private shards = new Set<number>();

  // vnodes = virtual nodes per shard; more vnodes means a smoother distribution
  constructor(shardIds: number[], private vnodes = 150) {
    shardIds.forEach((id) => this.addShard(id));
  }

  addShard(id: number): void {
    if (this.shards.has(id)) return;
    this.shards.add(id);
    for (let v = 0; v < this.vnodes; v++) {
      this.ring.push({ point: murmur3(`shard-${id}#${v}`), shard: id });
    }
    this.ring.sort((a, b) => a.point - b.point);
  }

  removeShard(id: number): void {
    this.shards.delete(id);
    this.ring = this.ring.filter((r) => r.shard !== id);
  }

  getShard(key: string | number): number {
    const h = murmur3(String(key));
    // binary search: first ring point >= h, wrapping around the ring
    let lo = 0;
    let hi = this.ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].point < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo % this.ring.length].shard;
  }

  shardCount(): number {
    return this.shards.size;
  }
}