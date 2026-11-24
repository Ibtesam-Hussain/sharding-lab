import { HashRouter } from '../src/routers/hash';
import { ConsistentHashRouter } from '../src/routers/consistentHash';
import { RangeRouter } from '../src/routers/range';
import { DirectoryRouter } from '../src/routers/directory';
import type { ShardRouter } from '../src/routers/types';

const N_SHARDS = 4;
const SEEDED = 1_000_000;
const SAMPLES = 1_000_000;

const strategies: Record<string, ShardRouter> = {
  hash: new HashRouter(N_SHARDS),
  consistent: new ConsistentHashRouter([0, 1, 2, 3], 150),
  range: new RangeRouter(N_SHARDS, SEEDED),
  directory: new DirectoryRouter(N_SHARDS, 1000, SEEDED),
};

// Same key shapes as loadtest/k6.js and the API
const uniformId = () => 1 + Math.floor(Math.random() * SEEDED);
const zipfId = () => Math.min(SEEDED, Math.floor(Math.pow(SEEDED, Math.random())));
const hotId = () => (Math.random() < 0.3 ? 1 : uniformId());
const newWriteId = () => 1_000_000_000_000 + Math.floor(Math.random() * 8e15);

function* seq(): Generator<number> {
  for (let k = 1; k <= SEEDED; k++) yield k;
}
function* draw(gen: () => number, n: number): Generator<number> {
  for (let i = 0; i < n; i++) yield gen();
}

function scenario(title: string, keys: () => Generator<number>) {
  console.log(`\n=== ${title} ===`);
  const rows = Object.entries(strategies).map(([name, router]) => {
    const counts = new Array<number>(N_SHARDS).fill(0);
    let total = 0;
    for (const k of keys()) {
      counts[router.getShard(k)]++;
      total++;
    }
    const share = counts.map((c) => (c / total) * 100);
    return {
      strategy: name,
      'shares % (s0 / s1 / s2 / s3)': share.map((s) => s.toFixed(1)).join(' / '),
      'busiest shard %': Math.max(...share).toFixed(1),
    };
  });
  console.table(rows);
}

scenario('Seeded data placement (ids 1..1M)', seq);
scenario('New writes (ids above 10^12, as the API generates)', () => draw(newWriteId, SAMPLES));
scenario('Uniform reads', () => draw(uniformId, SAMPLES));
scenario('Zipf reads (a few popular ids)', () => draw(zipfId, SAMPLES));
scenario('Hot-key reads (30% on id 1)', () => draw(hotId, SAMPLES));