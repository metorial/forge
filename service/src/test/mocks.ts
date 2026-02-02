import { vi } from 'vitest';

export function setupTestMocks() {
  vi.mock('../providers/aws-codebuild', () => ({
    startAwsCodeBuildQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) }
  }));

  vi.mock('../storage', () => ({
    storage: {
      putObject: vi.fn().mockResolvedValue({ storageKey: 'test-key' }),
      getObject: vi.fn().mockResolvedValue({ data: Buffer.from('') }),
      getPublicURL: vi.fn().mockResolvedValue({ url: 'http://example.com/artifact' }),
      upsertBucket: vi.fn().mockResolvedValue(undefined)
    }
  }));

  vi.mock('../queues/deleteWorkflow', () => ({
    deleteWorkflowQueue: { add: vi.fn().mockResolvedValue({ id: 'test-job' }) }
  }));
}
