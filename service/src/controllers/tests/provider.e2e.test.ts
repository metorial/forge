import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDatabase } from '../../test/setup';
import { forgeClient } from '../../test/client';
import { setupTestMocks } from '../../test/mocks';

setupTestMocks();

describe('provider:getDefault E2E', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it('returns the default provider', async () => {
    const result = await forgeClient.provider.getDefault({});

    expect(result).toMatchObject({
      object: 'forgeprovider',
      id: expect.any(String),
      identifier: expect.any(String),
      name: 'aws.code-build',
      createdAt: expect.any(Date)
    });
  });
});
