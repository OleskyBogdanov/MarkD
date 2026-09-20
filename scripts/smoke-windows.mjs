/* global process, console */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
if (process.platform !== 'win32') throw new Error('Windows smoke must run on Windows');
const profile = await mkdtemp(join(tmpdir(), 'markd-win-smoke-'));
const executable = process.env.MARKD_SMOKE_EXE || join(process.cwd(), 'dist-package', 'win-unpacked', 'MarkD.exe');
const child = spawn(executable, [], { env: { ...process.env, MARKD_USER_DATA_DIR: profile, MARKD_E2E_HEADLESS: '1' }, stdio: 'inherit' });
const exited = new Promise(resolve => child.once('exit', resolve));
let spawnError;
child.on('error', error => { spawnError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`App exited with ${child.exitCode}`);
    const logDirectory = join(profile, 'logs');
    const files = await readdir(logDirectory).catch(() => []);
    const entries = (await Promise.all(files.filter(name => name.endsWith('.log')).map(name => readFile(join(logDirectory, name), 'utf8'))))
      .flatMap(content => content.split('\n').filter(Boolean).map(line => JSON.parse(line)));
    if (entries.some(entry => ['warn', 'error', 'fatal'].includes(entry.level))) throw new Error('Packaged app logged errors');
    if (entries.some(entry => entry.event === 'renderer.did-finish-load')) { ready = true; break; }
    await delay(100);
  }
  if (!ready) throw new Error('Renderer did not become ready');
  console.log('Windows packaged renderer is ready without logged errors');
} finally {
  if (child.pid && child.exitCode === null) { child.kill(); await exited; }
  await rm(profile, { recursive: true, force: true });
}
