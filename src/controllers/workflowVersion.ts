import { Paginator } from '@lowerdeck/pagination';
import { v } from '@lowerdeck/validation';
import { workflowVersionPresenter } from '../presenters';
import { workflowVersionService } from '../services';
import { app } from './_app';
import { workflowApp } from './workflow';

export let workflowVersionApp = workflowApp.use(async ctx => {
  let workflowVersionId = ctx.body.workflowVersionId;
  if (!workflowVersionId) throw new Error('Workflow Version ID is required');

  let version = await workflowVersionService.getWorkflowVersionById({
    id: workflowVersionId,
    workflow: ctx.workflow
  });

  return { version };
});

export let workflowVersionController = app.controller({
  create: workflowApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),
        workflowId: v.string(),

        name: v.string(),

        steps: v.array(
          v.object({
            name: v.string(),
            type: v.enumOf(['script']),
            initScript: v.optional(v.array(v.string())),
            actionScript: v.array(v.string()),
            cleanupScript: v.optional(v.array(v.string()))
          })
        )
      })
    )
    .do(async ctx => {
      let version = await workflowVersionService.createWorkflowVersion({
        workflow: ctx.workflow,
        input: {
          name: ctx.input.name,
          steps: ctx.input.steps.map(s => ({
            ...s,
            initScript: s.initScript ?? [],
            cleanupScript: s.cleanupScript ?? []
          }))
        }
      });
      return workflowVersionPresenter(version);
    }),

  list: workflowApp
    .handler()
    .input(
      Paginator.validate(
        v.object({
          workflowId: v.string(),
          instanceId: v.string()
        })
      )
    )
    .do(async ctx => {
      let paginator = await workflowVersionService.listWorkflowVersions({
        workflow: ctx.workflow
      });

      let list = await paginator.run(ctx.input);

      return Paginator.presentLight(list, workflowVersionPresenter);
    }),

  get: workflowVersionApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),
        workflowId: v.string()
      })
    )
    .do(async ctx => workflowVersionPresenter(ctx.version))
});
