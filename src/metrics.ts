import { Counter, Histogram, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics();

const queries = new Counter({
  name: 'shard_queries_total',
  help: 'Queries per shard',
  labelNames: ['shard', 'op'],
});

const latency = new Histogram({
  name: 'shard_query_seconds',
  help: 'Query latency per shard',
  labelNames: ['shard', 'op'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
});

export async function track<T>(
  shard: number,
  op: 'read' | 'write',
  fn: () => Promise<T>
): Promise<T> {
  const labels = { shard: String(shard), op };
  const end = latency.startTimer(labels);
  try {
    return await fn();
  } finally {
    end();
    queries.inc(labels);
  }
}

export { register };