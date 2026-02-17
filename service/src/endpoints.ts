import { RedisClient } from 'bun';
import { forgeApi } from './controllers';
import { db } from './db';

let server = Bun.serve({
  fetch: forgeApi,
  port: 52020
});

console.log(`Service running on http://localhost:${server.port}`);

Bun.serve({
  fetch: async _ => {
    try {
      await db.tenant.count();

      let redis = new RedisClient(process.env.REDIS_URL?.replace('rediss://', 'redis://'), {
        tls: process.env.REDIS_URL?.startsWith('rediss://')
      });
      await redis.ping();

      return new Response('OK');
    } catch (e) {
      return new Response('Service Unavailable', { status: 503 });
    }
  },
  port: 12121
});
