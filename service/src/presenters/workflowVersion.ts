import type {
  Workflow,
  WorkflowArtifact,
  WorkflowVersion,
  WorkflowVersionStep
} from '../../prisma/generated/client';

export let workflowVersionPresenter = (
  artifact: WorkflowVersion & {
    steps: (WorkflowVersionStep & {
      artifactToDownload: WorkflowArtifact | null;
    })[];
    workflow: Workflow;
  }
) => ({
  object: 'workflow.run',

  id: artifact.id,
  identifier: artifact.identifier,
  name: artifact.name,

  workflowId: artifact.workflow.id,

  steps: artifact.steps.sort((a, b) => a.index - b.index).map(workflowVersionStepPresenter),

  createdAt: artifact.createdAt
});

export let workflowVersionStepPresenter = (
  step: WorkflowVersionStep & {
    artifactToDownload: WorkflowArtifact | null;
  }
) => ({
  object: 'workflow.run.step',

  id: step.id,
  type: step.type,
  name: step.name,

  initScript: step.initScript,
  actionScript: step.actionScript,
  cleanupScript: step.cleanupScript,

  artifactId: step.artifactToDownload ? step.artifactToDownload.id : undefined,
  artifactDestinationPath: step.artifactToDownload ? step.artifactToDownload.name : undefined,

  artifactSourcePath: step.artifactToUploadPath,
  artifactName: step.artifactToUploadName,

  createdAt: step.createdAt
});
