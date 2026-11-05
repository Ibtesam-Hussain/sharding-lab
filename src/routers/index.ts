import { config } from '../config';
import { HashRouter } from './hash';
import { ConsistentHashRouter } from './consistentHash';
import type { ShardRouter } from './types';

const n = config.shardUrls.length;
if (n === 0) throw new Error('SHARD_URLS is empty');

export const router: ShardRouter =
  config.strategy === 'consistent'
    ? new ConsistentHashRouter(Array.from({ length: n }, (_, i) => i))
    : new HashRouter(n);