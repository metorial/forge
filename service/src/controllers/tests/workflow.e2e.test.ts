import { describe, it, expect, beforeEach, vi } from 'vitest';
import { times } from 'lodash';
import { WorkflowStatus } from '../../../prisma/generated/client';
import { testDb, cleanDatabase } from '../../test/setup';
import { fixtures } from '../../test/fixtures';
import { forgeClient } from '../../test/client';

vi.mock('../../providers/aws-codebuild', () => ({
  startAwsCodeBuildQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) }
}));

vi.mock('../../storage', () => ({
  storage: {
    putObject: vi.fn().mockResolvedValue({ storageKey: 'test-key' }),
    getObject: vi.fn().mockResolvedValue({ data: Buffer.from('') }),
    getPublicURL: vi.fn().mockResolvedValue({ url: 'http://example.com/artifact' }),
    upsertBucket: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../../queues/deleteWorkflow', () => ({
  deleteWorkflowQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) }
}));

describe('workflow:upsert E2E', () => {
  const f = fixtures(testDb);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('creates a new workflow', async () => {
    const tenant = await f.tenant.default();

    const result = await forgeClient.workflow.upsert({
      tenantId: tenant.id,
      identifier: 'my-workflow',
      name: 'My Workflow'
    });

    expect(result).toMatchObject({
      object: 'forgeworkflow',
      id: expect.any(String),
      identifier: 'my-workflow',
      name: 'My Workflow',
      status: WorkflowStatus.active,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date)
    });
  });

  it('updates existing workflow with same identifier', async () => {
    const tenant = await f.tenant.default();

    await forgeClient.workflow.upsert({
      tenantId: tenant.id,
      identifier: 'existing-workflow',
      name: 'Original Name'
    });

    const result = await forgeClient.workflow.upsert({
      tenantId: tenant.id,
      identifier: 'existing-workflow',
      name: 'Updated Name'
    });

    expect(result).toMatchObject({
      identifier: 'existing-workflow',
      name: 'Updated Name'
    });
  });
});

describe('workflow:list E2E', () => {
  const f = fixtures(testDb);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('returns workflows for a tenant', async () => {
    const workflow = await f.workflow.withTenant();
    const tenant = workflow.tenant;
    const provider = workflow.provider;

    // Create additional workflows
    const additionalWorkflows = await Promise.all(
      times(2, (i: number) =>
        f.workflow.default({
          tenantOid: tenant.oid,
          providerOid: provider.oid,
          overrides: { identifier: `workflow-${i + 1}` }
        })
      )
    );
    const workflows = [workflow, ...additionalWorkflows];

    // Create workflow for different tenant (shouldn't appear)
    const otherWorkflow = await f.workflow.withTenant({
      workflowOverrides: { identifier: 'other-workflow' }
    });

    const workflowIds = workflows.map(w => w.id);

    const result = await forgeClient.workflow.list({
      tenantId: tenant.id,
      limit: 10
    });

    expect(result.items).toHaveLength(3);
    result.items.forEach(item => {
      expect(workflowIds).toContain(item.id);
    });
    expect(result.items.map(i => i.id)).not.toContain(otherWorkflow.id);
  });
});

describe('workflow:get E2E', () => {
  const f = fixtures(testDb);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('returns a workflow by ID', async () => {
    const workflow = await f.workflow.withTenant();

    const result = await forgeClient.workflow.get({
      tenantId: workflow.tenant.id,
      workflowId: workflow.id
    });

    expect(result).toMatchObject({
      object: 'forgeworkflow',
      id: workflow.id,
      identifier: workflow.identifier,
      name: workflow.name,
      status: WorkflowStatus.active
    });
  });
});

describe('workflow:update E2E', () => {
  const f = fixtures(testDb);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('updates workflow name', async () => {
    const workflow = await f.workflow.withTenant();

    const result = await forgeClient.workflow.update({
      tenantId: workflow.tenant.id,
      workflowId: workflow.id,
      name: 'Updated Workflow Name'
    });

    expect(result).toMatchObject({
      id: workflow.id,
      name: 'Updated Workflow Name'
    });
  });
});

describe('workflow:delete E2E', () => {
  const f = fixtures(testDb);

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('deletes a workflow', async () => {
    const workflow = await f.workflow.withTenant();

    const result = await forgeClient.workflow.delete({
      tenantId: workflow.tenant.id,
      workflowId: workflow.id
    });

    expect(result).toMatchObject({
      id: workflow.id,
      status: WorkflowStatus.active // Status change happens async via queue
    });
  });
});
