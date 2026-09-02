/* global console */
import { execFileSync, execSync } from 'node:child_process';
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
const command = `cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac --${normalized} --dir --publish never`;
execSync(command, { stdio: 'inherit' });

const appPath = join(process.cwd(), 'dist-package', `mac-${normalized}`, 'MarkD.app');
const frameworkPath = join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
const asarPath = join(appPath, 'Contents', 'Resources', 'app.asar');
for (const requiredPath of [frameworkPath, asarPath]) {
  if (!existsSync(requiredPath)) throw new Error(`Packaged app is incomplete: ${requiredPath}`);
}

execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
console.log(`Verified packaged app: ${appPath}`);
