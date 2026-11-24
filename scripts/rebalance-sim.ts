import { mkdirSync, writeFileSync } from 'node:fs';
import { HashRouter } from '../src/routers/hash';
import { ConsistentHashRouter } from '../src/routers/consistentHash';
import type { ShardRouter } from '../src/routers/types';

// Imports the router classes directly (not routers/index.ts), so no .env or database is needed.

const KEYS = Number(process.argv[2] ?? 1_000_000);
const DEFAULT_VNODES = 150;
const VNODE_SWEEP = [1, 10, 50, 150, 500, 1000];

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const pct = (x: number): string => ((x / KEYS) * 100).toFixed(2) + '%';
const fmt = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : 'inf');

// Map keys 1..KEYS to shard ids. Uint8Array keeps memory small (shard ids < 256).
function assign(router: ShardRouter): { map: Uint8Array; ms: number } {
  const map = new Uint8Array(KEYS);
  const t0 = process.hrtime.bigint();
  for (let k = 1; k <= KEYS; k++) map[k - 1] = router.getShard(k);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { map, ms };
}

// How evenly keys are spread across shards
function balance(map: Uint8Array, shardIds: number[]) {
  const counts = new Map<number, number>(shardIds.map((s) => [s, 0]));
  for (let i = 0; i < map.length; i++) {
    counts.set(map[i], (counts.get(map[i]) ?? 0) + 1);
  }
  const arr = shardIds.map((s) => counts.get(s) ?? 0);
  const mean = KEYS / shardIds.length;
  const variance = arr.reduce((a, c) => a + (c - mean) ** 2, 0) / arr.length;
  return {
    shares: arr.map((c) => ((c / KEYS) * 100).toFixed(1)).join(' / '),
    maxOverMin: Math.max(...arr) / Math.min(...arr),
    cvPct: (Math.sqrt(variance) / mean) * 100, // std deviation as % of the mean
  };
}

// Adding a shard: how many keys changed owner, and where they went
function addShardMoves(before: Uint8Array, after: Uint8Array, newId: number) {
  let moved = 0;
  let toNew = 0;
  for (let i = 0; i < KEYS; i++) {
    if (before[i] !== after[i]) {
      moved++;
      if (after[i] === newId) toNew++;
    }
  }
  return { moved, toNew, reshuffled: moved - toNew };
}

// Removing a shard: its keys must move, but keys on surviving shards should not
function removeShardMoves(before: Uint8Array, after: Uint8Array, removedId: number) {
  let moved = 0;
  let reshuffled = 0;
  for (let i = 0; i < KEYS; i++) {
    if (before[i] !== after[i]) {
      moved++;
      if (before[i] !== removedId) reshuffled++;
    }
  }
  return { moved, reshuffled };
}

// ---------- 7.1: keys moved when the shard count changes ----------
function experiment1() {
  console.log(`\n=== 7.1 Keys moved when the shard count changes (${KEYS.toLocaleString()} keys) ===`);

  const strategies: Record<string, (n: number) => ShardRouter> = {
    hash: (n) => new HashRouter(n),
    consistent: (n) => new ConsistentHashRouter(ids(n), DEFAULT_VNODES),
  };

  const rows: Record<string, string>[] = [];
  for (const [name, make] of Object.entries(strategies)) {
    const m4 = assign(make(4)).map;
    const m5 = assign(make(5)).map;
    const m3 = assign(make(3)).map;

    const add = addShardMoves(m4, m5, 4);
    const rem = removeShardMoves(m4, m3, 3);

    rows.push({
      strategy: name,
      change: '4 -> 5 (add a shard)',
      'keys moved': pct(add.moved),
      'ideal minimum': '20.00%',
      'reshuffled between existing shards': pct(add.reshuffled),
    });
    rows.push({
      strategy: name,
      change: '4 -> 3 (remove a shard)',
      'keys moved': pct(rem.moved),
      'ideal minimum': '25.00%',
      'reshuffled between existing shards': pct(rem.reshuffled),
    });
  }
  console.table(rows);
  return rows;
}

// ---------- 7.2: virtual nodes vs balance, rebalancing and lookup cost ----------
function experiment2() {
  console.log(`\n=== 7.2 Virtual nodes vs balance (4 shards, ${KEYS.toLocaleString()} keys) ===`);

  const shardIds = ids(4);
  const nsPerLookup = (ms: number) => (ms * 1e6) / KEYS;
  const rows: Record<string, string>[] = [];

  // Reference: plain hash
  const h4 = assign(new HashRouter(4));
  const h5 = assign(new HashRouter(5));
  const hb = balance(h4.map, shardIds);
  rows.push({
    strategy: 'hash (reference)',
    vnodes: '-',
    'ring points': '-',
    'shares % (s0 / s1 / s2 / s3)': hb.shares,
    'busiest / quietest': fmt(hb.maxOverMin),
    'std dev % of mean': fmt(hb.cvPct, 2),
    'keys moved 4->5': pct(addShardMoves(h4.map, h5.map, 4).moved),
    'ns per lookup': fmt(nsPerLookup(h4.ms), 0),
  });

  for (const v of VNODE_SWEEP) {
    const a4 = assign(new ConsistentHashRouter(ids(4), v));
    const a5 = assign(new ConsistentHashRouter(ids(5), v));
    const b = balance(a4.map, shardIds);
    const mv = addShardMoves(a4.map, a5.map, 4);
    rows.push({
      strategy: 'consistent',
      vnodes: String(v),
      'ring points': String(4 * v),
      'shares % (s0 / s1 / s2 / s3)': b.shares,
      'busiest / quietest': fmt(b.maxOverMin),
      'std dev % of mean': fmt(b.cvPct, 2),
      'keys moved 4->5': pct(mv.moved),
      'ns per lookup': fmt(nsPerLookup(a4.ms), 0),
    });
  }
  console.table(rows);
  return rows;
}

const e1 = experiment1();
const e2 = experiment2();

mkdirSync('results', { recursive: true });
writeFileSync(
  'results/rebalance-sim.json',
  JSON.stringify({ keys: KEYS, experiment1: e1, experiment2: e2 }, null, 2)
);
console.log('\nSaved results/rebalance-sim.json');