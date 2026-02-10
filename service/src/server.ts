import { checkCodeBuildAccess } from './providers/aws-codebuild/access';

await import('./init');
await import('./instrument');
await import('./endpoints');
await import('./worker');

if (
  process.env.NODE_ENV == 'production' &&
  process.env.DEFAULT_PROVIDER === 'aws.code-build'
) {
  await checkCodeBuildAccess();
}
