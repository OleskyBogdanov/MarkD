/* global console */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const normalized = (() => {
  if (arch() === 'x64') return 'x64';
  if (arch() === 'arm64') return 'arm64';
  throw new Error(`Unsupported architecture: ${arch()}`);
})();

console.log(`Packaging target arch: ${normalized}`);
execFileSync(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--mac', `--${normalized}`, '--dir', '--publish', 'never'], { stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });

const appPath = join(process.cwd(), 'dist-package', normalized === 'x64' ? 'mac' : 'mac-arm64', 'MarkD.app');
const frameworkPath = join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
const asarPath = join(appPath, 'Contents', 'Resources', 'app.asar');
for (const requiredPath of [frameworkPath, asarPath]) {
  if (!existsSync(requiredPath)) throw new Error(`Packaged app is incomplete: ${requiredPath}`);
}

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
console.log(`Verified packaged app: ${appPath}`);
