export const config = {
  port: Number(process.env.PORT ?? 3000),
  strategy: (process.env.STRATEGY ?? 'hash') as 'hash' | 'consistent',
  shardUrls: (process.env.SHARD_URLS ?? '').split(',').filter(Boolean),
  poolSize: Number(process.env.POOL_SIZE ?? 20),
};