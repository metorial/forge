import { notFoundError, ServiceError } from '@lowerdeck/error';
import type { Workflow, WorkflowRun } from '../../../prisma/generated/client';
import { db } from '../../db';

export class BuildContext {
  private constructor(public readonly workflow: Workflow, public readonly run: WorkflowRun) {}

  static async of(runId: string): Promise<BuildContext> {
    let run = await db.workflowRun.findUnique({
      where: { id: runId },
      include: { workflow: true }
    });
    if (!run) throw new ServiceError(notFoundError('workflow.run'));

    return new BuildContext(run.workflow, run);
  }

  async listArtifacts() {
    return await db.workflowArtifact.findMany({
      where: { runOid: this.run.oid }
    });
  }

  async listSteps() {
    return await db.workflowRunStep.findMany({
      where: { runOid: this.run.oid },
      include: { step: true }
    });
  }

  async getVersion() {
    let version = await db.workflowVersion.findUnique({
      where: { oid: this.run.versionOid }
    });
    if (!version) throw new ServiceError(notFoundError('workflow.version'));
    return version;
  }
}
