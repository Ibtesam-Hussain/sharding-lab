export const config = {
  port: Number(process.env.PORT ?? 3000),
  strategy: (process.env.STRATEGY ?? 'hash') as 'hash' | 'consistent' | 'range' | 'directory',
  shardUrls: (process.env.SHARD_URLS ?? '').split(',').filter(Boolean),
  poolSize: Number(process.env.POOL_SIZE ?? 20),
  seedKeys: Number(process.env.SEED_KEYS ?? 1_000_000), // must match the seed size
};