import { GetLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { BatchGetBuildsCommand, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { combineQueueProcessors, createQueue } from '@lowerdeck/queue';
import { stringify } from 'yaml';
import { db } from '../../db';
import { encryption } from '../../encryption';
import { env } from '../../env';
import { snowflake } from '../../id';
import { workflowArtifactService } from '../../services';
import { storage } from '../../storage';
import { BuildContext } from '../_lib/buildContext';
import { codebuild, logsClient } from './codeBuild';
import { ensureProject } from './project';

const SYSTEM_OUTPUT_PREFIX = `X@%%MT0RL-)AL:: `;

let shellEscape = (str: string) => `'${str.replace(/'/g, `'\\''`)}'`;
let logSystem = (data: any) =>
  `echo ${shellEscape(SYSTEM_OUTPUT_PREFIX + JSON.stringify(data))}`;
let parseSystemLog = (line: string) => {
  let idx = line.indexOf(SYSTEM_OUTPUT_PREFIX);
  if (idx === -1) return null;
  let json = line.slice(SYSTEM_OUTPUT_PREFIX.length);
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export let startAwsCodeBuildQueue = createQueue<{ runId: string }>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/start',
  workerOpts: {
    concurrency: 5,
    limiter: {
      max: 25,
      duration: 1000
    }
  }
});

let startBuildQueueProcessor = startAwsCodeBuildQueue.process(async data => {
  if (!codebuild) throw new Error('CodeBuild client not initialized');

  let ctx = await BuildContext.of(data.runId);
  let version = await ctx.getVersion();

  let project = await ensureProject();

  let steps = await ctx.listSteps();
  let artifacts = await ctx.listArtifacts();

  let setupStep = steps.find(s => s.type === 'setup')!;
  let teardownStep = steps.find(s => s.type === 'teardown')!;

  let initSteps = steps.filter(s => s.type === 'init');
  let actionSteps = steps.filter(s => s.type === 'action');
  let cleanupSteps = steps.filter(s => s.type === 'cleanup');

  let envVars: Record<string, string> = await encryption.decrypt({
    entityId: ctx.run.id,
    encrypted: ctx.run.encryptedEnvironmentVariables
  });

  let artifactData: Record<string, { bucket: string; storageKey: string }> = {};

  let startBuildResp = await codebuild.send(
    new StartBuildCommand({
      projectName: project.projectName,
      environmentVariablesOverride: [
        ...Object.entries({
          ...envVars,

          WORKFLOW_RUN_ID: ctx.run.id,
          WORKFLOW_VERSION_ID: version.id,
          RUNTIME: 'metorial-forge@1.0.0'
        }).map(([k, v]) => ({
          name: k,
          value: v,
          type: 'PLAINTEXT' as const
        }))
      ],

      buildspecOverride: stringify({
        version: '0.2',
        phases: {
          build: {
            commands: [
              logSystem({ type: 'build.start' }),

              logSystem({ type: 'step.start', stepId: setupStep.id }),

              'echo "Started build on Metorial Forge (runner: AWS/1) ..."',
              'echo "Setting up build environment ..."',

              'apt-get update && apt-get install -y zip unzip curl',

              'mkdir -p ./forge',
              'cd ./forge',
              'mkdir -p ./output',

              logSystem({ type: 'download-artifacts.start' }),
              `echo "Downloading initial files ..."`,

              ...(
                await Promise.all(
                  artifacts.map(async artifact => {
                    let res = await storage.getPublicURL(
                      artifact.bucket,
                      artifact.storageKey,
                      60 * 60 * 6
                    );

                    return [
                      logSystem({ type: 'download-artifact.start', artifactId: artifact.id }),
                      `curl -sL ${shellEscape(res.url)} -o /tmp/artifact_${artifact.oid}.zip`,
                      `unzip -o /tmp/artifact_${artifact.oid}.zip -d ./`,
                      `rm /tmp/artifact_${artifact.oid}.zip`,
                      logSystem({ type: 'download-artifact.end', artifactId: artifact.id })
                    ];
                  })
                )
              ).flat(),

              logSystem({ type: 'download-artifacts.end' }),

              'echo "Build environment setup complete."',
              logSystem({ type: 'step.end', stepId: setupStep.id }),

              ...initSteps.flatMap(step => [
                logSystem({ type: 'step.start', stepId: step.id }),
                ...(step.step?.initScript ?? ['echo "No action"']),
                logSystem({ type: 'step.end', stepId: step.id })
              ]),

              ...(
                await Promise.all(
                  actionSteps.flatMap(async step => {
                    let inner: string[] = [];

                    if (step.step?.type == 'script') {
                      inner = step.step?.actionScript ?? ['echo "No action"'];
                    } else if (step.step?.type == 'download_artifact') {
                      let artifact = await db.workflowArtifact.findFirstOrThrow({
                        where: {
                          oid: step.step.artifactToDownloadOid!,
                          workflowOid: ctx.run.workflowOid
                        }
                      });
                      let res = await storage.getPublicURL(
                        artifact.bucket,
                        artifact.storageKey,
                        60 * 60 * 6
                      );

                      inner = [
                        `echo "Downloading artifact ${artifact.name} ..."`,
                        `curl -sL ${shellEscape(res.url)} -o /tmp/artifact_${artifact.oid}`,
                        `mv /tmp/artifact_${artifact.oid} ${shellEscape(step.step.artifactToDownloadPath!)}`,
                        `echo "Download complete."`
                      ];
                    } else if (step.step?.type == 'upload_artifact') {
                      let uploadInfo =
                        await workflowArtifactService.putArtifactFromBuilderStart({
                          run: ctx.run,
                          expirationSecs: 60 * 60 * 6
                        });

                      artifactData[step.id] = {
                        bucket: uploadInfo.bucket,
                        storageKey: uploadInfo.storageKey
                      };

                      inner = [
                        `echo "Uploading artifact ${step.step.artifactToUploadName!} from ${step.step.artifactToUploadPath!} ..."`,
                        `curl -X PUT ${shellEscape(uploadInfo.uploadUrl)} -H "Content-Type: application/octet-stream" --data-binary @${shellEscape(step.step.artifactToUploadPath!)} `,
                        `echo "Upload complete."`,
                        logSystem({
                          type: 'upload-artifact.register',
                          stepId: step.id
                        })
                      ];
                    }

                    return [
                      logSystem({ type: 'step.start', stepId: step.id }),
                      ...inner,
                      logSystem({ type: 'step.end', stepId: step.id })
                    ];
                  })
                )
              ).flat(),

              ...cleanupSteps.flatMap(step => [
                logSystem({ type: 'step.start', stepId: step.id }),
                ...(step.step?.cleanupScript ?? ['echo "No action"']),
                logSystem({ type: 'step.end', stepId: step.id })
              ]),

              logSystem({ type: 'step.start', stepId: teardownStep.id }),
              'echo "Tearing down build environment ..."',
              'echo "Build complete ... powered by Metorial Forge (AWS/1)."',
              logSystem({ type: 'step.end', stepId: teardownStep.id }),

              logSystem({ type: 'build.end' })
            ]
          }
        }
      })
    })
  );

  await waitForBuildQueue.add({
    runId: ctx.run.id,
    buildId: startBuildResp.build?.id!,
    attemptNo: 1,
    artifactData
  });
});

let waitForBuildQueue = createQueue<{
  runId: string;
  buildId: string;
  attemptNo: number;

  artifactData: Record<
    string,
    {
      bucket: string;
      storageKey: string;
    }
  >;
}>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/wait'
});

let waitForBuildQueueProcessor = waitForBuildQueue.process(async data => {
  if (!codebuild) throw new Error('CodeBuild client not initialized');

  let buildInfo = await codebuild.send(
    new BatchGetBuildsCommand({
      ids: [data.buildId]
    })
  );
  let build = buildInfo.builds?.[0];
  if (!build) return;

  let ended =
    build.buildStatus == 'FAILED' ||
    build.buildStatus == 'FAULT' ||
    build.buildStatus == 'STOPPED' ||
    build.buildStatus == 'SUCCEEDED' ||
    build.buildStatus == 'TIMED_OUT';
  let inProgress =
    build.buildStatus == 'IN_PROGRESS' && build.logs?.streamName && build.logs?.groupName;

  if (ended) {
    await buildEndedQueue.add(data);
  } else if (inProgress) {
    await startedBuildQueue.add({
      ...data,
      cloudwatch: {
        groupName: build.logs!.groupName!,
        streamName: build.logs!.streamName!
      }
    });
  } else {
    await waitForBuildQueue.add(
      {
        ...data,
        attemptNo: data.attemptNo + 1
      },
      { delay: data.attemptNo < 10 ? 1000 : 5000 }
    );
  }
});

let startedBuildQueue = createQueue<{
  runId: string;
  buildId: string;
  cloudwatch: { groupName: string; streamName: string };

  artifactData: Record<
    string,
    {
      bucket: string;
      storageKey: string;
    }
  >;
}>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/started'
});

let startedBuildQueueProcessor = startedBuildQueue.process(async data => {
  if (!codebuild) throw new Error('CodeBuild client not initialized');

  let buildInfo = await codebuild.send(
    new BatchGetBuildsCommand({
      ids: [data.buildId]
    })
  );
  let build = buildInfo.builds?.[0];
  if (!build) return;

  let ctx = await BuildContext.of(data.runId);

  await monitorBuildOutputQueue.add({
    ...data,
    runOid: ctx.run.oid
  });
});

let monitorBuildOutputQueue = createQueue<{
  runId: string;
  runOid: bigint;
  buildId: string;
  cloudwatch: { groupName: string; streamName: string };
  nextToken?: string;

  buildStarted?: boolean;
  buildEnded?: boolean;

  currentStepOid?: bigint;

  artifactData: Record<
    string,
    {
      bucket: string;
      storageKey: string;
    }
  >;
}>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/mopt'
});

let monitorBuildOutputQueueProcessor = monitorBuildOutputQueue.process(async data => {
  if (!logsClient || !codebuild) throw new Error('CodeBuild client not initialized');

  let buildInfo = await codebuild.send(
    new BatchGetBuildsCommand({
      ids: [data.buildId]
    })
  );
  let build = buildInfo.builds?.[0];
  if (!build) return;

  let logResp = await logsClient.send(
    new GetLogEventsCommand({
      logGroupName: data.cloudwatch.groupName,
      logStreamName: data.cloudwatch.streamName,

      nextToken: data.nextToken,
      startFromHead: true
    })
  );

  let buildStarted = !!data.buildStarted;
  let buildEnded = !!data.buildEnded;

  let currentStepOid = data.currentStepOid;

  let collectedMessages = new Map<bigint, string>();

  for (let event of logResp.events || []) {
    let message = (event.message || '').trim();
    if (message.startsWith('[Container]')) continue;

    let systemLog = parseSystemLog(message);

    if (systemLog) {
      if (systemLog.type === 'build.start') {
        await db.workflowRun.update({
          where: { id: data.runId },
          data: {
            status: 'running',
            startedAt: build.startTime ? new Date(build.startTime) : new Date()
          }
        });

        buildStarted = true;
      } else if (systemLog.type === 'build.end') {
        buildEnded = true;
        await buildEndedQueue.add({ runId: data.runId, buildId: data.buildId });
      } else if (systemLog.type === 'step.start') {
        let step = await db.workflowRunStep.update({
          where: { id: systemLog.stepId, runOid: data.runOid },
          data: {
            status: 'running',
            startedAt: event.timestamp ? new Date(event.timestamp) : new Date()
          }
        });
        currentStepOid = step.oid;
      } else if (systemLog.type === 'step.end') {
        let step = await db.workflowRunStep.update({
          where: { id: systemLog.stepId, runOid: data.runOid },
          data: {
            status: 'succeeded',
            endedAt: event.timestamp ? new Date(event.timestamp) : new Date()
          }
        });
        if (currentStepOid === step.oid) currentStepOid = undefined;
      } else if (systemLog.type === 'upload-artifact.register') {
        let step = await db.workflowRunStep.findFirst({
          where: {
            id: systemLog.stepId,
            runOid: data.runOid
          },
          include: { step: true, run: true }
        });
        let artifactData = step ? data.artifactData[step.id] : null;

        if (artifactData && step?.step?.type === 'upload_artifact') {
          await workflowArtifactService.putArtifactFromBuilderFinish({
            run: step.run,
            name: step.step.artifactToUploadName!,
            type: 'output',
            artifactData
          });
        }
      }
    } else if (buildStarted && !buildEnded && currentStepOid) {
      let string = collectedMessages.get(currentStepOid) || '';
      string += JSON.stringify([event.timestamp || 0, message]) + '\n';
      collectedMessages.set(currentStepOid, string);
    }
  }

  for (let [stepOid, msg] of collectedMessages.entries()) {
    let step = await db.workflowRunStep.findFirstOrThrow({
      where: { oid: stepOid, runOid: data.runOid }
    });
    await db.workflowRunOutputTemp.create({
      data: {
        oid: snowflake.nextId(),
        runOid: data.runOid,
        stepOid: step.oid,
        output: msg.trim()
      }
    });
  }

  if (logResp.nextForwardToken && build.buildStatus == 'IN_PROGRESS') {
    await monitorBuildOutputQueue.add(
      {
        ...data,
        nextToken: logResp.nextForwardToken,
        buildEnded,
        buildStarted,
        currentStepOid
      },
      { delay: 1000 }
    );
  }
});

let buildEndedQueue = createQueue<{ runId: string; buildId: string }>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/end'
});

let buildEndedQueueProcessor = buildEndedQueue.process(async data => {
  if (!codebuild) throw new Error('CodeBuild client not initialized');

  let buildInfo = await codebuild.send(
    new BatchGetBuildsCommand({
      ids: [data.buildId]
    })
  );
  let build = buildInfo.builds?.[0];
  if (!build) return;

  let ctx = await BuildContext.of(data.runId);

  await db.workflowRunStep.updateMany({
    where: { runOid: ctx.run.oid, status: 'running' },
    data: { status: 'failed', endedAt: new Date() }
  });

  let hasFailedSteps = (await db.workflowRunStep.findFirst({
    where: { runOid: ctx.run.oid, status: 'failed' }
  }))!!;
  let failed = hasFailedSteps || build.buildStatus != 'SUCCEEDED';

  await db.workflowRun.updateMany({
    where: { id: data.runId },
    data: {
      status: failed ? 'failed' : 'succeeded',
      endedAt: build.endTime ? new Date(build.endTime) : new Date()
    }
  });

  await storeOutputQueue.add({ runId: data.runId });
});

let storeOutputQueue = createQueue<{ runId: string }>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/storou'
});

let storeOutputQueueProcessor = storeOutputQueue.process(async data => {
  let run = await db.workflowRun.findFirst({ where: { id: data.runId } });
  if (!run) return;

  let steps = await db.workflowRunStep.findMany({
    where: { runOid: run.oid }
  });

  for (let step of steps) {
    let outputs = await db.workflowRunOutputTemp.findMany({
      where: { stepOid: step.oid },
      orderBy: { createdAt: 'asc' }
    });

    let fullOutput = outputs.map(o => o.output).join('\n');

    let outputBucket = env.storage.LOG_BUCKET_NAME;
    let outputStorageKey = `runs/${run.id}/log/${step.id}`;

    await storage.putObject(outputBucket, outputStorageKey, fullOutput);

    await db.workflowRunStep.updateMany({
      where: { oid: step.oid },
      data: {
        outputBucket,
        outputStorageKey
      }
    });
  }

  await storeOutputCleanupQueue.add({ runOid: run.oid }, { delay: 10000 });
});

let storeOutputCleanupQueue = createQueue<{ runOid: bigint }>({
  redisUrl: env.service.REDIS_URL,
  name: 'forge/aws-cbld/stoclu'
});

let storeOutputCleanupQueueProcessor = storeOutputCleanupQueue.process(async data => {
  await db.workflowRunOutputTemp.deleteMany({
    where: { runOid: data.runOid }
  });
});

export let awsCodeBuildProcessors = combineQueueProcessors([
  startBuildQueueProcessor,
  waitForBuildQueueProcessor,
  startedBuildQueueProcessor,
  monitorBuildOutputQueueProcessor,
  buildEndedQueueProcessor,
  storeOutputQueueProcessor,
  storeOutputCleanupQueueProcessor
]);
