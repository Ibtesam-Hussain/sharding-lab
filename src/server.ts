import Fastify from 'fastify';
import { config } from './config';
import { router } from './routers';
import { pools } from './db/pools';
import { userRoutes } from './routes/users';
import { register } from './metrics';

async function main() {
  const app = Fastify({ logger: false }); // logging off: it skews benchmarks

  app.get('/health', async () => ({
    ok: true,
    strategy: router.name,
    shards: router.shardCount(),
  }));

  app.get('/metrics', async (_req, reply) =>
    reply.header('Content-Type', register.contentType).send(await register.metrics())
  );

  // Handy for smoke tests: which shard does this key map to?
  app.get<{ Params: { id: string } }>('/debug/route/:id', async (req) => ({
    id: req.params.id,
    shard: router.getShard(req.params.id),
  }));

  await app.register(userRoutes);
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`API :${config.port} | strategy=${router.name} | shards=${pools.length}`);

  const shutdown = async () => {
    await app.close();
    await Promise.all(pools.map((p) => p.end()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();