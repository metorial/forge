import type {
  Workflow,
  WorkflowArtifact,
  WorkflowRun,
  WorkflowRunStep,
  WorkflowVersion,
  WorkflowVersionStep
} from '../../prisma/generated/client';
import { workflowVersionStepPresenter } from './workflowVersion';

export let workflowRunPresenter = (
  artifact: WorkflowRun & {
    workflow: Workflow;
    version: WorkflowVersion;
    steps: (WorkflowRunStep & { step: WorkflowVersionStep | null })[];
    artifacts: WorkflowArtifact[];
  }
) => ({
  object: 'workflow.run',

  id: artifact.id,
  status: artifact.status,

  workflowId: artifact.workflow.id,
  version: artifact.version.id,

  steps: artifact.steps.sort((a, b) => a.index - b.index).map(workflowRunStepPresenter),

  createdAt: artifact.createdAt,
  updatedAt: artifact.updatedAt,
  startedAt: artifact.startedAt,
  endedAt: artifact.endedAt
});

export let workflowRunStepPresenter = (
  step: WorkflowRunStep & { step: WorkflowVersionStep | null }
) => ({
  object: 'workflow.run.step',

  id: step.id,

  type: step.type,
  name: step.name,
  status: step.status,

  createdAt: step.createdAt,
  startedAt: step.startedAt,
  endedAt: step.endedAt,

  step: step.step ? workflowVersionStepPresenter(step.step) : null
});
