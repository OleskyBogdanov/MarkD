import { z } from 'zod';

const githubFeed = z.strictObject({
  provider: z.literal('github'),
  owner: z.string().regex(/^[a-z\d][a-z\d-]*$/i),
  repo: z.string().regex(/^[a-z\d][a-z\d._-]*$/i),
  private: z.literal(false),
  channel: z.enum(['latest', 'latest-arm64', 'latest-x64'])
});

export const parseReleaseFeed = (value: unknown, platform: NodeJS.Platform, arch: string): z.infer<typeof githubFeed> => {
  const config = githubFeed.parse(value);
  if (platform !== 'darwin' && platform !== 'win32') throw new Error('Unsupported update platform');
  if (platform === 'win32' ? arch !== 'x64' : !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported update architecture');
  const expectedChannel = platform === 'darwin' ? `latest-${arch}` : 'latest';
  if (config.channel !== expectedChannel) throw new Error('Update channel does not match the installed architecture');
  return config;
};
