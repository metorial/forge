import { ObjectStorageClient } from 'object-storage-client';
import { env } from './env';

export let storage = new ObjectStorageClient(env.storage.OBJECT_STORAGE_URL);

setTimeout(async () => {
  await storage.upsertBucket(env.storage.LOG_BUCKET_NAME);
  await storage.upsertBucket(env.storage.ARTIFACT_BUCKET_NAME);
}, 5000);
