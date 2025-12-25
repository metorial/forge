import { notFoundError, ServiceError } from '@lowerdeck/error';
import { Service } from '@lowerdeck/service';
import { db } from '../db';
import { ID, snowflake } from '../id';

let include = {};

class instanceServiceImpl {
  async upsertInstance(d: {
    input: {
      name: string;
      identifier: string;
    };
  }) {
    return await db.instance.upsert({
      where: { identifier: d.input.identifier },
      update: { name: d.input.name },
      create: {
        oid: snowflake.nextId(),
        id: await ID.generateId('instance'),
        name: d.input.name,
        identifier: d.input.identifier
      },
      include
    });
  }

  async getInstanceById(d: { id: string }) {
    let instance = await db.instance.findFirst({
      where: { OR: [{ id: d.id }, { identifier: d.id }] },
      include
    });
    if (!instance) throw new ServiceError(notFoundError('instance'));
    return instance;
  }
}

export let instanceService = Service.create(
  'instanceService',
  () => new instanceServiceImpl()
).build();
