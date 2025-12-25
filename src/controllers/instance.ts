import { v } from '@lowerdeck/validation';
import { instancePresenter } from '../presenters/instance';
import { instanceService } from '../services';
import { app } from './_app';

export let instanceApp = app.use(async ctx => {
  let instanceId = ctx.body.instanceId;
  if (!instanceId) throw new Error('Instance ID is required');

  let instance = await instanceService.getInstanceById({ id: instanceId });

  return { instance };
});

export let instanceController = app.controller({
  upsert: app
    .handler()
    .input(
      v.object({
        name: v.string(),
        identifier: v.string()
      })
    )
    .do(async ctx => {
      let instance = await instanceService.upsertInstance({
        input: {
          name: ctx.input.name,
          identifier: ctx.input.identifier
        }
      });
      return instancePresenter(instance);
    }),

  get: instanceApp
    .handler()
    .input(
      v.object({
        instanceId: v.string()
      })
    )
    .do(async ctx => instancePresenter(ctx.instance))
});
