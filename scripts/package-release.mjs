/* global console, process */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const requireEnv = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Release requires ${name}`);
  return value;
};
const target = process.platform;
if (!['darwin', 'win32'].includes(target)) throw new Error('Release must be built on macOS or Windows');
const targetArch = process.env.MARKD_RELEASE_ARCH || process.arch;
if (!(target === 'darwin' ? ['arm64', 'x64'] : ['x64']).includes(targetArch)) throw new Error('Unsupported release architecture');
const url = new URL(requireEnv('MARKD_UPDATE_URL'));
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('MARKD_UPDATE_URL must be a public HTTPS base URL');
url.pathname = `${url.pathname.replace(/\/$/, '')}/${target === 'darwin' ? 'mac' : 'win'}/${targetArch}/`;
const config = JSON.parse(readFileSync('package.json', 'utf8')).build;
config.extends = null;
config.forceCodeSigning = true;
config.publish = { provider: 'generic', url: url.href };
if (target === 'darwin') {
  requireEnv('CSC_LINK'); requireEnv('CSC_KEY_PASSWORD');
  requireEnv('APPLE_ID'); requireEnv('APPLE_APP_SPECIFIC_PASSWORD'); requireEnv('APPLE_TEAM_ID');
  config.mac = { ...config.mac, target: ['dmg', 'zip'], identity: requireEnv('MARKD_MAC_IDENTITY'), hardenedRuntime: true, notarize: true };
  if (config.mac.identity === '-') throw new Error('Developer ID identity required, ad-hoc signing is not a release');
} else {
  requireEnv('WIN_CSC_LINK'); requireEnv('WIN_CSC_KEY_PASSWORD');
  config.win = { ...config.win, signtoolOptions: { publisherName: requireEnv('MARKD_WINDOWS_PUBLISHER') }, verifyUpdateCodeSignature: true };
}
const directory = join(process.cwd(), 'output', 'release');
mkdirSync(directory, { recursive: true });
const releaseFile = join(directory, 'markd-release.json');
writeFileSync(releaseFile, JSON.stringify({ url: url.href }));
config.extraResources = [...config.extraResources, { from: releaseFile, to: 'markd-release.json' }];
const configPath = join(directory, 'builder.json');
writeFileSync(configPath, JSON.stringify(config, null, 2));
// The release path never runs package-mac.mjs or replaces the Developer ID signature.
execFileSync(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--config', configPath, target === 'darwin' ? '--mac' : '--win', `--${targetArch}`, '--publish', 'never'], { stdio: 'inherit' });
console.log(`Release artifacts ready for verification and publication to ${url.href}`);
