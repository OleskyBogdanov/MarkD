/* global console, process */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createReleaseConfig } from './release-config.mjs';

const target = process.platform;
const targetArch = process.env.MARKD_RELEASE_ARCH || process.arch;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const { config, feed } = createReleaseConfig(pkg, { platform: target, arch: targetArch, env: process.env });
const directory = join(process.cwd(), 'output', 'release');
mkdirSync(directory, { recursive: true });
const releaseFile = join(directory, 'markd-release.json');
writeFileSync(releaseFile, JSON.stringify(feed));
config.extraResources = [...config.extraResources, { from: releaseFile, to: 'markd-release.json' }];
const configPath = join(directory, 'builder.json');
writeFileSync(configPath, JSON.stringify(config, null, 2));
// Build every platform first. A separate job uploads the complete set to a draft.
execFileSync(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--config', configPath, target === 'darwin' ? '--mac' : '--win', `--${targetArch}`, '--publish', 'never'], { stdio: 'inherit' });
console.log(`Release artifacts ready for https://github.com/${feed.owner}/${feed.repo}/releases`);
