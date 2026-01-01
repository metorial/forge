import type { Tenant } from '../../prisma/generated/client';

export let tenantPresenter = (tenant: Tenant) => ({
  object: 'forgetenant',

  id: tenant.id,
  identifier: tenant.identifier,
  name: tenant.name,

  createdAt: tenant.createdAt
});
