import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { router } from '../src/routers';
import { pools } from '../src/db/pools';

const TOTAL = Number(process.argv[2] ?? 1_000_000);
const TRUNCATE = process.argv.includes('--truncate');
const BATCH = 50_000; // ids processed per round

const COUNTRIES = ['PK', 'US', 'IN', 'GB', 'DE', 'AE', 'CA', 'FR', 'BR', 'JP'];
const pick = () => COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];

// Bulk-load one shard's rows with COPY (text format: tab-separated, \n per row)
async function copyRows(shard: number, text: string): Promise<void> {
  const client = await pools[shard].connect();
  try {
    const copy = client.query(
      copyFrom('COPY users (id, name, email, country) FROM STDIN')
    );
    await pipeline(Readable.from([Buffer.from(text)]), copy);
  } finally {
    client.release();
  }
}

async function main() {
  const n = pools.length;
  console.log(`Seeding ${TOTAL.toLocaleString()} rows | strategy=${router.name} | shards=${n}`);

  if (TRUNCATE) {
    await Promise.all(pools.map((p) => p.query('TRUNCATE users')));
    console.log('Truncated users on all shards');
  }

  const started = Date.now();

  for (let start = 1; start <= TOTAL; start += BATCH) {
    const end = Math.min(start + BATCH - 1, TOTAL);

    // Group this batch's rows by the shard the router picks
    const buckets: string[][] = Array.from({ length: n }, () => []);
    for (let id = start; id <= end; id++) {
      const shard = router.getShard(id);
      buckets[shard].push(`${id}\tuser_${id}\tuser_${id}@example.com\t${pick()}\n`);
    }

    // COPY into every shard in parallel
    await Promise.all(
      buckets.map((rows, shard) =>
        rows.length ? copyRows(shard, rows.join('')) : Promise.resolve()
      )
    );

    const secs = (Date.now() - started) / 1000;
    const rate = Math.round(end / secs);
    console.log(`  ${end.toLocaleString()} / ${TOTAL.toLocaleString()}  (${rate.toLocaleString()} rows/s)`);
  }

  // Refresh planner statistics so queries behave realistically
  await Promise.all(pools.map((p) => p.query('ANALYZE users')));

  // Per-shard result table
  const stats = await Promise.all(
    pools.map(async (p, shard) => {
      const { rows } = await p.query(
        `SELECT count(*)::bigint AS n,
                pg_size_pretty(pg_total_relation_size('users')) AS size
         FROM users`
      );
      return { shard, rows: Number(rows[0].n), size: rows[0].size as string };
    })
  );

  const total = stats.reduce((s, x) => s + x.rows, 0);
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(
    stats.map((x) => ({
      shard: x.shard,
      rows: x.rows.toLocaleString(),
      share: ((x.rows / total) * 100).toFixed(2) + '%',
      table_size: x.size,
    }))
  );
  console.log(`Total rows across shards: ${total.toLocaleString()}`);

  await Promise.all(pools.map((p) => p.end()));
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  if (/duplicate key/i.test(err.message)) {
    console.error('Rows already exist. Re-run with --truncate to start clean.');
  }
  await Promise.all(pools.map((p) => p.end().catch(() => {})));
  process.exit(1);
});