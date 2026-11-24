export interface ShardRouter {
  readonly name: string;
  getShard(key: string | number): number;
  shardCount(): number;
  /** Shards that may hold ids in [from, to]. Omit if the strategy can't narrow it down. */
  shardsForRange?(from: number, to: number): number[];
}