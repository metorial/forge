import type { Provider } from '../../prisma/generated/client';

export let providerPresenter = (provider: Provider) => ({
  object: 'provider',

  id: provider.id,
  identifier: provider.identifier,
  name: provider.name,

  createdAt: provider.createdAt
});
