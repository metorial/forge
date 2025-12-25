import { Hash } from '@lowerdeck/hash';
import { Service } from '@lowerdeck/service';
import { db } from '../db';
import { env } from '../env';
import { ID, snowflake } from '../id';

let identifier = await Hash.sha256(
  JSON.stringify({
    name: env.provider.DEFAULT_PROVIDER,
    cbProject: env.codeBuild.CODE_BUILD_PROJECT_NAME
  })
);

let currentProvider = db.provider.upsert({
  where: { identifier },
  update: { name: env.provider.DEFAULT_PROVIDER },
  create: {
    oid: snowflake.nextId(),
    id: await ID.generateId('provider'),
    identifier,
    name: env.provider.DEFAULT_PROVIDER
  }
});

class providerServiceImpl {
  async getDefaultProvider() {
    return await currentProvider;
  }
}

export let providerService = Service.create(
  'providerService',
  () => new providerServiceImpl()
).build();
