import type { Instance } from '../../prisma/generated/client';

export let instancePresenter = (instance: Instance) => ({
  object: 'instance',

  id: instance.id,
  identifier: instance.identifier,
  name: instance.name,

  createdAt: instance.createdAt
});
