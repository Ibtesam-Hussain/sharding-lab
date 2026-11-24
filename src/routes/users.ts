import type { FastifyInstance } from 'fastify';
import { router } from '../routers';
import { pools } from '../db/pools';
import { track } from '../metrics';

// Simple app-side ID generator for the lab.
// Seeded IDs will be 1..N; new IDs live far above that range.
// Real systems use Snowflake-style IDs.
const newId = () => 1_000_000_000_000 + Math.floor(Math.random() * 8e15);

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/users/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: '^[0-9]+$' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const shard = router.getShard(id);
      const { rows } = await track(shard, 'read', () =>
        pools[shard].query(
          'SELECT id, name, email, country, created_at FROM users WHERE id = $1',
          [id]
        )
      );
      if (!rows[0]) return reply.code(404).send({ error: 'not found' });
      return { shard, user: rows[0] };
    }
  );

  app.post<{ Body: { name: string; email: string; country?: string } }>(
    '/users',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            country: { type: 'string' },
          },
          required: ['name', 'email'],
        },
      },
    },
    async (req, reply) => {
      const id = newId();
      const shard = router.getShard(id);
      const { name, email, country } = req.body;
      await track(shard, 'write', () =>
        pools[shard].query(
          'INSERT INTO users (id, name, email, country) VALUES ($1, $2, $3, $4)',
          [id, name, email, country ?? null]
        )
      );
      return reply.code(201).send({ id, shard });
    }
  );



  // ---- 7.5: queries that do not map to a single shard key ----

  const allShards = () => Array.from({ length: pools.length }, (_, i) => i);

  // Ask the given shards in parallel, then merge by id and cut to the limit
  async function scatter(shards: number[], sql: string, params: unknown[], limit: number) {
    const results = await Promise.all(
      shards.map((s) => track(s, 'scan', () => pools[s].query(sql, params)))
    );
    const rows = results.flatMap((r) => r.rows);
    rows.sort((a, b) => Number(a.id) - Number(b.id)); // ids stay below 2^53, so Number is safe
    return rows.slice(0, limit);
  }

  // Filter on a non-shard-key column: every shard must be asked (scatter-gather)
  app.get<{ Querystring: { country: string; limit?: number } }>(
    '/users',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            country: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
          required: ['country'],
        },
      },
    },
    async (req) => {
      const { country, limit = 50 } = req.query;
      const shards = allShards();
      const users = await scatter(
        shards,
        'SELECT id, name, email, country FROM users WHERE country = $1 ORDER BY id LIMIT $2',
        [country, limit],
        limit
      );
      return { shardsQueried: shards.length, count: users.length, users };
    }
  );

  // Id range: only the strategies that can narrow it down ask fewer shards
  app.get<{ Querystring: { from: number; to: number; limit?: number } }>(
    '/users/range',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'integer', minimum: 1 },
            to: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
          required: ['from', 'to'],
        },
      },
    },
    async (req, reply) => {
      const { from, to, limit = 50 } = req.query;
      if (to < from) return reply.code(400).send({ error: 'to must be >= from' });
      const shards = router.shardsForRange ? router.shardsForRange(from, to) : allShards();
      const users = await scatter(
        shards,
        'SELECT id, name, email, country FROM users WHERE id BETWEEN $1 AND $2 ORDER BY id LIMIT $3',
        [from, to, limit],
        limit
      );
      return { shardsQueried: shards.length, count: users.length, users };
    }
  );
}