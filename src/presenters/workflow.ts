import type { Workflow } from '../../prisma/generated/client';

export let workflowPresenter = (workflow: Workflow) => ({
  object: 'workflow',

  id: workflow.id,
  status: workflow.status,
  identifier: workflow.identifier,

  name: workflow.name,

  createdAt: workflow.createdAt,
  updatedAt: workflow.updatedAt
});
