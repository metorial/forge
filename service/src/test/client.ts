import { createForgeClient } from '../../../clients/typescript/src/index';
import { createFetchRouter } from '@lowerdeck/testing-tools';
import { forgeApi } from '../controllers';

type ClientOptsLike = {
  endpoint: string;
  headers?: Record<string, string | undefined>;
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  onRequest?: (d: {
    endpoint: string;
    name: string;
    payload: any;
    headers: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
  }) => any;
};

const fetchRouter = createFetchRouter();
const registerInMemoryRoute = (endpoint: string) => {
  fetchRouter.registerRoute(endpoint, request => forgeApi(request, undefined));
};

const defaultEndpoint = 'http://forge.test/metorial-forge';

export const createTestForgeClient = (opts: Partial<ClientOptsLike> = {}) => {
  const endpoint = opts.endpoint ?? defaultEndpoint;
  registerInMemoryRoute(endpoint);
  fetchRouter.install();

  return createForgeClient({
    ...opts,
    endpoint
  } as ClientOptsLike);
};

export const forgeClient = createTestForgeClient();
export type ForgeTestClient = ReturnType<typeof createTestForgeClient>;
