import { createClient } from '@lowerdeck/rpc-client';
import { ClientOpts } from '@lowerdeck/rpc-client/dist/shared/clientBuilder';
import type { ForgeClient } from '../../../service/src/controllers';

export let createForgeClient = (o: ClientOpts) => createClient<ForgeClient>(o);
