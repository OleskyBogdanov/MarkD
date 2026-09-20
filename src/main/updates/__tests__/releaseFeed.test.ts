import { expect, test } from 'vitest';
import type { RequestOptions } from 'node:http';
import type { AppUpdater } from 'electron-updater';
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider.js';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js';
import { parseReleaseFeed } from '../releaseFeed.js';

const base = { provider: 'github', owner: 'OleskyBogdanov', repo: 'MarkD', private: false };
const platforms = [
  ['darwin', 'arm64', 'latest-arm64', 'latest-arm64-mac.yml', 'MarkD-0.4.1-arm64.zip'],
  ['darwin', 'x64', 'latest-x64', 'latest-x64-mac.yml', 'MarkD-0.4.1-x64.zip'],
  ['win32', 'x64', 'latest', 'latest.yml', 'MarkD-Setup-0.4.1-x64.exe']
] as const;

test.each(platforms)('%s/%s fetches the correct GitHub release metadata with installed updater 6', async (platform, arch, channel, metadata, artifact) => {
  const feed = parseReleaseFeed({ ...base, channel }, platform, arch);
  const requests: RequestOptions[] = [];
  const prefix = '/OleskyBogdanov/MarkD/releases';
  const responses: Record<string, string> = {
    [`${prefix}.atom`]: '<feed><entry><title>MarkD 0.4.1</title><link href="https://github.com/OleskyBogdanov/MarkD/releases/tag/v0.4.1"/><content>Fixes</content></entry></feed>',
    [`${prefix}/latest`]: JSON.stringify({ tag_name: 'v0.4.1' }),
    [`${prefix}/download/v0.4.1/${metadata}`]: JSON.stringify({ version: '0.4.1', files: [{ url: artifact, sha512: Buffer.alloc(64).toString('base64') }] })
  };
  const executor = { request: async (options: RequestOptions) => {
    requests.push(options);
    const body = responses[options.path ?? ''];
    if (!body) throw new Error(`Unexpected request: ${options.path}`);
    return body;
  } } as ProviderRuntimeOptions['executor'];
  const provider = new GitHubProvider(feed, { allowPrerelease: false } as AppUpdater, { executor, platform, isUseMultipleRangeRequest: false });
  const info = await provider.getLatestVersion();
  expect(info.version).toBe('0.4.1');
  expect(provider.resolveFiles(info)[0].url.href).toBe(`https://github.com${prefix}/download/v0.4.1/${artifact}`);
  expect(requests).toHaveLength(3);
  expect(requests.every(request => request.protocol === 'https:' && request.hostname === 'github.com')).toBe(true);
  expect(JSON.stringify(requests.map(request => request.headers)).toLowerCase()).not.toContain('authorization');
});

test('release feed rejects credentials, private repositories, arbitrary hosts and wrong architectures', () => {
  const valid = { ...base, channel: 'latest-arm64' };
  for (const extra of [{ token: 'secret' }, { private: true }, { host: 'example.com' }, { url: 'https://example.com' }, { owner: '../owner' }]) {
    expect(() => parseReleaseFeed({ ...valid, ...extra }, 'darwin', 'arm64')).toThrow();
  }
  expect(() => parseReleaseFeed(valid, 'darwin', 'x64')).toThrow(/channel/);
  expect(() => parseReleaseFeed(valid, 'win32', 'arm64')).toThrow(/architecture/);
  expect(() => parseReleaseFeed(valid, 'linux', 'arm64')).toThrow(/platform/);
});
