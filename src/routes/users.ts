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
}