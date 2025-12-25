import type {
  Workflow,
  WorkflowVersion,
  WorkflowVersionStep
} from '../../prisma/generated/client';

export let workflowVersionPresenter = (
  artifact: WorkflowVersion & {
    steps: WorkflowVersionStep[];
    workflow: Workflow;
  }
) => ({
  object: 'workflow.run',

  id: artifact.id,
  identifier: artifact.identifier,

  workflowId: artifact.workflow.id,

  steps: artifact.steps.sort((a, b) => a.index - b.index).map(workflowVersionStepPresenter),

  createdAt: artifact.createdAt
});

export let workflowVersionStepPresenter = (step: WorkflowVersionStep) => ({
  object: 'workflow.run.step',

  id: step.id,
  type: step.type,
  name: step.name,

  initScript: step.initScript,
  actionScript: step.actionScript,
  cleanupScript: step.cleanupScript,

  createdAt: step.createdAt
});
