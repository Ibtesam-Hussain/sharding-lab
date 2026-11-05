import { Pool } from 'pg';
import { config } from '../config';

// pools[i] is the connection pool for shard i
export const pools: Pool[] = config.shardUrls.map(
  (connectionString) => new Pool({ connectionString, max: config.poolSize })
);