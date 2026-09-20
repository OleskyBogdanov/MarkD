/* global structuredClone */

import { URL } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const releaseVersion = (pkg) => {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)) {
    throw new Error('Release requires a stable numeric version in package.json');
  }
  return pkg.version;
};

export const releaseRepository = (pkg) => {
  const url = new URL(pkg.repository?.url);
  const parts = url.pathname.replace(/\.git$/, '').split('/');
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || parts.length !== 3 ||
      !/^[a-z\d][a-z\d-]*$/i.test(parts[1]) || !/^[a-z\d][a-z\d._-]*$/i.test(parts[2])) {
    throw new Error('repository.url must name a public github.com repository over HTTPS');
  }
  return { owner: parts[1], repo: parts[2] };
};

export const createReleaseConfig = (pkg, { platform, arch, env }) => {
  if (!['darwin', 'win32'].includes(platform)) throw new Error('Release must be built on macOS or Windows');
  if (!(platform === 'darwin' ? ['arm64', 'x64'] : ['x64']).includes(arch)) throw new Error('Unsupported release architecture');
  releaseVersion(pkg);
  const requireEnv = name => {
    if (!env[name]) throw new Error(`Release requires ${name}`);
    return env[name];
  };
  const feed = {
    provider: 'github', ...releaseRepository(pkg), private: false,
    channel: platform === 'darwin' ? `latest-${arch}` : 'latest'
  };
  const config = structuredClone(pkg.build);
  config.extends = null;
  config.forceCodeSigning = true;
  config.publish = { ...feed, releaseType: 'draft' };
  if (platform === 'darwin') {
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) requireEnv(name);
    config.mac = {
      ...config.mac, target: ['dmg', 'zip'], identity: requireEnv('MARKD_MAC_IDENTITY'),
      artifactName: 'MarkD-${version}-${arch}.${ext}', hardenedRuntime: true, notarize: true
    };
    if (config.mac.identity === '-') throw new Error('Developer ID identity required, ad-hoc signing is not a release');
  } else {
    requireEnv('WIN_CSC_LINK'); requireEnv('WIN_CSC_KEY_PASSWORD');
    config.win = { ...config.win, signtoolOptions: { publisherName: requireEnv('MARKD_WINDOWS_PUBLISHER') }, verifyUpdateCodeSignature: true };
  }
  return { config, feed };
};

export const requiredReleaseAssets = (version) => [
  `MarkD-${version}-arm64.dmg`, `MarkD-${version}-arm64.zip`,
  `MarkD-${version}-x64.dmg`, `MarkD-${version}-x64.zip`,
  `MarkD-Setup-${version}-x64.exe`,
  'latest-arm64-mac.yml', 'latest-x64-mac.yml', 'latest.yml'
];

export const collectReleaseAssets = (directory, version) => {
  const required = requiredReleaseAssets(version);
  for (const name of required) {
    if (!statSync(join(directory, name)).isFile()) throw new Error(`Missing release artifact: ${name}`);
  }
  const blockmaps = readdirSync(directory).filter(name => required.some(asset => name === `${asset}.blockmap`));
  return [...required, ...blockmaps].map(name => join(directory, name));
};
