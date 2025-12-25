import { notFoundError, ServiceError } from '@lowerdeck/error';
import { Paginator } from '@lowerdeck/pagination';
import { Service } from '@lowerdeck/service';
import type { Instance, Workflow } from '../../prisma/generated/client';
import { db } from '../db';
import { ID, snowflake } from '../id';
import { deleteWorkflowQueue } from '../queues/deleteWorkflow';
import { providerService } from './provider';

let include = {};

class workflowServiceImpl {
  async upsertWorkflow(d: {
    input: {
      name: string;
      identifier: string;
    };
    instance: Instance;
  }) {
    return await db.workflow.upsert({
      where: {
        instanceOid_identifier: {
          identifier: d.input.identifier,
          instanceOid: d.instance.oid
        },
        status: 'active'
      },
      update: { name: d.input.name },
      create: {
        oid: snowflake.nextId(),
        id: await ID.generateId('workflow'),
        name: d.input.name,
        identifier: d.input.identifier,
        instanceOid: d.instance.oid,
        status: 'active',
        providerOid: (await providerService.getDefaultProvider()).oid
      },
      include
    });
  }

  async getWorkflowById(d: { id: string; instance: Instance }) {
    let workflow = await db.workflow.findFirst({
      where: {
        OR: [{ id: d.id }, { identifier: d.id }],
        instanceOid: d.instance.oid,
        status: 'active'
      },
      include
    });
    if (!workflow) throw new ServiceError(notFoundError('workflow'));
    return workflow;
  }

  async listWorkflows(d: { instance: Instance }) {
    return Paginator.create(({ prisma }) =>
      prisma(
        async opts =>
          await db.workflow.findMany({
            ...opts,
            where: {
              instanceOid: d.instance.oid,
              status: 'active'
            }
          })
      )
    );
  }

  async updateWorkflow(d: {
    workflow: Workflow;
    input: {
      name?: string;
    };
  }) {
    return await db.workflow.update({
      where: { oid: d.workflow.oid },
      data: {
        name: d.input.name ?? d.workflow.name
      },
      include
    });
  }

  async deleteWorkflow(d: { workflow: Workflow }) {
    await deleteWorkflowQueue.add({ workflowId: d.workflow.id });

    return d.workflow;
  }
}

export let workflowService = Service.create(
  'workflowService',
  () => new workflowServiceImpl()
).build();
