import { Paginator } from '@lowerdeck/pagination';
import { v } from '@lowerdeck/validation';
import { workflowPresenter } from '../presenters/workflow';
import { workflowService } from '../services';
import { app } from './_app';
import { instanceApp } from './instance';

export let workflowApp = instanceApp.use(async ctx => {
  let workflowId = ctx.body.workflowId;
  if (!workflowId) throw new Error('Workflow ID is required');

  let workflow = await workflowService.getWorkflowById({
    id: workflowId,
    instance: ctx.instance
  });

  return { workflow };
});

export let workflowController = app.controller({
  upsert: instanceApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),

        name: v.string(),
        identifier: v.string()
      })
    )
    .do(async ctx => {
      let workflow = await workflowService.upsertWorkflow({
        instance: ctx.instance,
        input: {
          name: ctx.input.name,
          identifier: ctx.input.identifier
        }
      });
      return workflowPresenter(workflow);
    }),

  list: instanceApp
    .handler()
    .input(
      Paginator.validate(
        v.object({
          instanceId: v.string()
        })
      )
    )
    .do(async ctx => {
      let paginator = await workflowService.listWorkflows({
        instance: ctx.instance
      });

      let list = await paginator.run(ctx.input);

      return Paginator.presentLight(list, workflowPresenter);
    }),

  get: workflowApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),
        workflowId: v.string()
      })
    )
    .do(async ctx => workflowPresenter(ctx.workflow)),

  delete: workflowApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),
        workflowId: v.string()
      })
    )
    .do(async ctx => {
      let workflow = await workflowService.deleteWorkflow({
        workflow: ctx.workflow
      });

      return workflowPresenter(workflow);
    }),

  update: workflowApp
    .handler()
    .input(
      v.object({
        instanceId: v.string(),
        workflowId: v.string(),

        name: v.optional(v.string())
      })
    )
    .do(async ctx => {
      let workflow = await workflowService.updateWorkflow({
        workflow: ctx.workflow,
        input: {
          name: ctx.input.name
        }
      });

      return workflowPresenter(workflow);
    })
});
