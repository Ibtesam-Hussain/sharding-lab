import { config } from '../config';
import { HashRouter } from './hash';
import { ConsistentHashRouter } from './consistentHash';
import { RangeRouter } from './range';
import { DirectoryRouter } from './directory';
import type { ShardRouter } from './types';

const n = config.shardUrls.length;
if (n === 0) throw new Error('SHARD_URLS is empty');

function build(): ShardRouter {
  switch (config.strategy) {
    case 'consistent':
      return new ConsistentHashRouter(Array.from({ length: n }, (_, i) => i));
    case 'range':
      return new RangeRouter(n, config.seedKeys);
    case 'directory':
      return new DirectoryRouter(n, 1000, config.seedKeys);
    default:
      return new HashRouter(n);
  }
}

export const router: ShardRouter = build();