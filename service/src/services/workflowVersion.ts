import { notFoundError, ServiceError } from '@lowerdeck/error';
import { generatePlainId } from '@lowerdeck/id';
import { Paginator } from '@lowerdeck/pagination';
import { Service } from '@lowerdeck/service';
import type { Workflow } from '../../prisma/generated/client';
import { db } from '../db';
import { ID, snowflake } from '../id';
import { providerService } from './provider';

export type WorkflowVersionSteps = {
  name: string;
  type: 'script';
  initScript: string[];
  actionScript: string[];
  cleanupScript: string[];
};

let include = { steps: true, workflow: true };

class workflowVersionServiceImpl {
  async createWorkflowVersion(d: {
    workflow: Workflow;
    input: {
      name: string;
      steps: WorkflowVersionSteps[];
    };
  }) {
    let identifier = generatePlainId(6);

    return await db.$transaction(async db => {
      let version = await db.workflowVersion.create({
        data: {
          oid: snowflake.nextId(),
          id: await ID.generateId('workflowVersion'),
          identifier,

          isCurrent: true,

          name: d.input.name,

          workflowOid: d.workflow.oid,
          providerOid: (await providerService.getDefaultProvider()).oid,

          steps: {
            create: d.input.steps.map((s, index) => ({
              oid: snowflake.nextId(),
              id: ID.generateIdSync('workflowVersionStep'),

              name: s.name,
              type: s.type,

              index,

              initScript: s.initScript,
              actionScript: s.actionScript,
              cleanupScript: s.cleanupScript
            }))
          }
        },
        include
      });

      await db.workflow.updateMany({
        where: { oid: d.workflow.oid },
        data: { currentVersionOid: version.oid }
      });

      await db.workflowVersion.updateMany({
        where: {
          workflowOid: d.workflow.oid,
          oid: { not: version.oid }
        },
        data: { isCurrent: false }
      });

      return version;
    });
  }

  async getWorkflowVersionById(d: { id: string; workflow: Workflow }) {
    let workflowVersion = await db.workflowVersion.findFirst({
      where: {
        OR: [{ id: d.id }, { identifier: d.id }],
        workflowOid: d.workflow.oid
      },
      include
    });
    if (!workflowVersion) throw new ServiceError(notFoundError('workflow.version'));
    return workflowVersion;
  }

  async listWorkflowVersions(d: { workflow: Workflow }) {
    return Paginator.create(({ prisma }) =>
      prisma(
        async opts =>
          await db.workflowVersion.findMany({
            ...opts,
            where: {
              workflowOid: d.workflow.oid
            },
            include
          })
      )
    );
  }
}

export let workflowVersionService = Service.create(
  'workflowVersionService',
  () => new workflowVersionServiceImpl()
).build();
