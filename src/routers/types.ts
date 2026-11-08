export interface ShardRouter {
  readonly name: string;
  getShard(key: string | number): number; // returns shard index
  shardCount(): number;
}