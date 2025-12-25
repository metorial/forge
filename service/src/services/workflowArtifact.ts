import { notFoundError, ServiceError } from '@lowerdeck/error';
import { generatePlainId } from '@lowerdeck/id';
import { Paginator } from '@lowerdeck/pagination';
import { Service } from '@lowerdeck/service';
import type {
  Workflow,
  WorkflowArtifactType,
  WorkflowRun
} from '../../prisma/generated/client';
import { db } from '../db';
import { env } from '../env';
import { ID, snowflake } from '../id';
import { storage } from '../storage';

let include = { run: true, workflow: true };

class workflowArtifactServiceImpl {
  async getWorkflowArtifactById(d: { id: string; workflow: Workflow }) {
    let workflowArtifact = await db.workflowArtifact.findFirst({
      where: {
        id: d.id,
        workflowOid: d.workflow.oid
      },
      include
    });
    if (!workflowArtifact) throw new ServiceError(notFoundError('workflow.artifact'));
    return workflowArtifact;
  }

  async listWorkflowArtifacts(d: { workflow: Workflow; runIds?: string[] }) {
    return Paginator.create(({ prisma }) =>
      prisma(
        async opts =>
          await db.workflowArtifact.findMany({
            ...opts,
            where: {
              workflowOid: d.workflow.oid,
              run: d.runIds ? { id: { in: d.runIds } } : undefined
            },
            include
          })
      )
    );
  }

  async putArtifact(d: {
    run: WorkflowRun;
    name: string;
    content: Blob;
    type: WorkflowArtifactType;
  }) {
    let bucket = env.storage.ARTIFACT_BUCKET_NAME;
    let storageKey = `${d.run.id}/${generatePlainId(10)}`;

    await storage.putObject(bucket, storageKey, d.content);

    return await db.workflowArtifact.create({
      data: {
        oid: snowflake.nextId(),
        id: await ID.generateId('workflowArtifact'),
        name: d.name,
        type: d.type,
        storageKey,
        bucket,
        workflowOid: d.run.workflowOid,
        runOid: d.run.oid
      },
      include
    });
  }
}

export let workflowArtifactService = Service.create(
  'workflowArtifactService',
  () => new workflowArtifactServiceImpl()
).build();
