/* global console, process */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { arch, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = process.cwd();
const targetArch = arch() === 'arm64' ? 'arm64' : 'x64';
const appPath = join(projectRoot, 'dist-package', `mac-${targetArch}`, 'MarkD.app');
const executablePath = join(appPath, 'Contents', 'MacOS', 'MarkD');
const userDataRoot = await mkdtemp(join(tmpdir(), 'markd-packaged-smoke-'));
const logsRoot = join(userDataRoot, 'logs');

const fuseOutput = execFileSync(
  'npx',
  ['--no-install', '@electron/fuses', 'read', '--app', appPath],
  { cwd: projectRoot, encoding: 'utf8' }
);

for (const expectedFuse of [
  'RunAsNode is Disabled',
  'EnableNodeOptionsEnvironmentVariable is Disabled',
  'EnableNodeCliInspectArguments is Disabled',
  'EnableEmbeddedAsarIntegrityValidation is Enabled',
  'OnlyLoadAppFromAsar is Enabled',
]) {
  assert.match(fuseOutput, new RegExp(expectedFuse));
}

execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

const childEnvironment = {
  ...process.env,
  MARKD_E2E_HEADLESS: '1',
  MARKD_USER_DATA_DIR: userDataRoot,
};
delete childEnvironment.NO_COLOR;

const child = spawn(executablePath, [], {
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exitPromise = new Promise((resolve) => child.once('exit', resolve));
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });

const readEntries = async () => {
  const files = await readdir(logsRoot).catch(() => []);
  const entries = [];

  for (const file of files.filter((name) => name.startsWith('markd-') && name.endsWith('.log'))) {
    const content = await readFile(join(logsRoot, file), 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      entries.push(JSON.parse(line));
    }
  }

  return entries;
};

const waitForRenderer = async () => {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged app exited before readiness (code ${child.exitCode}).\n${stdout}\n${stderr}`);
    }

    const entries = await readEntries();
    const events = new Set(entries.map((entry) => entry.event));
    if (events.has('app.ready') && events.has('renderer.did-finish-load')) {
      return entries;
    }

    await delay(100);
  }

  throw new Error(`Packaged app did not become ready within 20 seconds.\n${stdout}\n${stderr}`);
};

try {
  const entries = await waitForRenderer();
  const runtimeErrors = entries.filter((entry) => ['warn', 'error', 'fatal'].includes(entry.level));

  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({
    events: entries.map((entry) => entry.event),
    fusesVerified: 5,
    runtimeErrors,
  }, null, 2));
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    const exitedCleanly = await Promise.race([
      exitPromise.then(() => true),
      delay(5_000, false),
    ]);
    if (!exitedCleanly) {
      child.kill('SIGKILL');
      await exitPromise;
    }
  }
  await rm(userDataRoot, { recursive: true, force: true });
}
