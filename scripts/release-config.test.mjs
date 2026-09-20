import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { URL } from 'node:url';
import { validateConfiguration } from 'app-builder-lib/out/util/config/config.js';
import { createReleaseConfig, releaseRepository, releaseVersion, requiredReleaseAssets, collectReleaseAssets } from './release-config.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const env = Object.fromEntries(['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
  'MARKD_MAC_IDENTITY', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'MARKD_WINDOWS_PUBLISHER'].map(name => [name, 'test-placeholder']));
for (const [platform, arch, channel] of [['darwin', 'arm64', 'latest-arm64'], ['darwin', 'x64', 'latest-x64'], ['win32', 'x64', 'latest']]) {
  test(`${platform}/${arch} produces a valid signed GitHub build and isolated channel`, async () => {
    const { config, feed } = createReleaseConfig(pkg, { platform, arch, env });
    await validateConfiguration(config);
    assert.deepEqual(feed, { provider: 'github', owner: 'OleskyBogdanov', repo: 'MarkD', private: false, channel });
    assert.equal(config.publish.releaseType, 'draft');
    assert.equal(config.forceCodeSigning, true);
    assert.equal('token' in feed, false);
    if (platform === 'darwin') {
      assert.equal(config.mac.hardenedRuntime, true);
      assert.equal(config.mac.notarize, true);
      assert.deepEqual(config.mac.target, ['dmg', 'zip']);
      assert.match(config.mac.artifactName, /\$\{arch\}/);
    } else assert.equal(config.win.verifyUpdateCodeSignature, true);
  });
}
test('release signing and architecture cannot silently fall back to local builds', () => {
  assert.throws(() => createReleaseConfig(pkg, { platform: 'darwin', arch: 'arm64', env: {} }), /CSC_LINK/);
  assert.throws(() => createReleaseConfig(pkg, { platform: 'darwin', arch: 'arm64', env: { ...env, MARKD_MAC_IDENTITY: '-' } }), /Developer ID/);
  assert.throws(() => createReleaseConfig(pkg, { platform: 'win32', arch: 'arm64', env }), /architecture/);
  assert.throws(() => createReleaseConfig(pkg, { platform: 'linux', arch: 'x64', env }), /macOS or Windows/);
  assert.throws(() => createReleaseConfig(pkg, { platform: 'win32', arch: 'x64', env: {} }), /WIN_CSC_LINK/);
});
test('stable releases reject prereleases and external or credential-bearing repositories', () => {
  for (const version of ['0.4.1-beta.1', 'v0.4.1', '0.4', '01.2.3']) assert.throws(() => releaseVersion({ version }));
  for (const url of ['https://example.com/owner/repo', 'https://token@github.com/owner/repo', 'http://github.com/owner/repo', 'https://github.com/owner/repo/extra']) {
    assert.throws(() => releaseRepository({ repository: { url } }));
  }
  assert.deepEqual(releaseRepository(pkg), { owner: 'OleskyBogdanov', repo: 'MarkD' });
});
test('one draft requires installers and distinct update metadata for every platform', () => {
  const names = requiredReleaseAssets('0.4.1');
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('latest-arm64-mac.yml'));
  assert.ok(names.includes('latest-x64-mac.yml'));
  assert.ok(names.includes('latest.yml'));
  assert.ok(names.includes('MarkD-0.4.1-arm64.zip'));
  assert.ok(names.includes('MarkD-0.4.1-x64.zip'));
  assert.ok(names.includes('MarkD-Setup-0.4.1-x64.exe'));
});

test('draft collection rejects incomplete builds and excludes unrelated files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'markd-release-assets-'));
  try {
    const names = requiredReleaseAssets('0.4.1');
    for (const name of names.slice(1)) writeFileSync(join(directory, name), 'test artifact');
    assert.throws(() => collectReleaseAssets(directory, '0.4.1'));
    writeFileSync(join(directory, names[0]), 'test artifact');
    const blockmap = 'MarkD-0.4.1-arm64.zip.blockmap';
    writeFileSync(join(directory, blockmap), 'test blockmap');
    writeFileSync(join(directory, 'builder-debug.yml'), 'not a release asset');
    writeFileSync(join(directory, 'MarkD-0.3.0-arm64.zip'), 'old version');
    assert.deepEqual(collectReleaseAssets(directory, '0.4.1'), [...names, blockmap].map(name => join(directory, name)));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
