import { forgeApi } from './controllers';

console.log('Server is running');

Bun.serve({
  fetch: forgeApi.fetch,
  port: 52020
});

await import('./worker');
