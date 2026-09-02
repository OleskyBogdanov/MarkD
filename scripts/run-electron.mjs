/* global console, process */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const electronRoot = process.env.MARKD_ELECTRON_ROOT ?? join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents');
const executable = join(electronRoot, 'MacOS', 'Electron');
const framework = join(electronRoot, 'Frameworks', 'Electron Framework.framework', 'Electron Framework');
const defaultUserDataRoot = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Application Support', 'MarkD')
  : process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'MarkD')
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'MarkD');
const userDataRoot = process.env.MARKD_USER_DATA_DIR ?? defaultUserDataRoot;
const logsRoot = join(userDataRoot, 'logs');
const logPath = join(logsRoot, `launcher-${new Date().toISOString().slice(0, 10)}.log`);

const log = (level, event, details = {}) => {
  mkdirSync(logsRoot, { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    process: 'launcher',
    event,
    details,
    nodeVersion: process.versions.node,
    pid: process.pid
  })}\n`, 'utf8');
};

const missing = [executable, framework].filter((path) => !existsSync(path));
if (missing.length) {
  log('fatal', 'electron.runtime-incomplete', { missing });
  console.error(`Electron установлен не полностью. Подробности: ${logPath}`);
  console.error('Выполните npm ci и повторите запуск.');
  process.exit(1);
}

const child = spawn(executable, ['.'], { cwd: projectRoot, env: process.env, stdio: 'inherit' });
child.on('error', (error) => {
  log('fatal', 'electron.spawn-error', { message: error.message, stack: error.stack });
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (code && code !== 0) log('error', 'electron.non-zero-exit', { code, signal });
  process.exitCode = code ?? (signal ? 1 : 0);
});
