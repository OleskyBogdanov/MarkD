/* global console, process */
import assert from 'node:assert/strict';
import { arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const projectRoot = process.cwd();
const targetArch = arch() === 'arm64' ? 'arm64' : 'x64';
const executablePath = join(
  projectRoot,
  'dist-package',
  `mac-${targetArch}`,
  'MarkD.app',
  'Contents',
  'MacOS',
  'MarkD'
);
const appPath = join(projectRoot, 'dist-package', `mac-${targetArch}`, 'MarkD.app');
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

const runtimeErrors = [];
const electronApp = await electron.launch({
  executablePath,
  env: { ...process.env, MARKD_E2E_HEADLESS: '1' }
});

try {
  const window = await electronApp.firstWindow();
  window.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      runtimeErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  window.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));

  await window.getByTestId('start-screen').waitFor({ state: 'visible', timeout: 15_000 });

  const title = await window.title();
  const isWindowVisible = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible());
  const bridgeType = await window.evaluate(() => typeof window.desktop);
  const pageCount = await window.locator('.page-item').count();
  const bodyText = (await window.locator('body').innerText()).trim();

  assert.match(title, /MarkD$/);
  assert.equal(isWindowVisible, false, 'Smoke-тест не должен показывать окно приложения');
  assert.equal(bridgeType, 'object');
  assert.ok(pageCount === 0, 'При запуске должен отображаться стартовый экран, а не редактор');
  assert.equal(await window.getByTestId('start-screen').count(), 1, 'Стартовый экран должен быть видимым');
  assert.ok(bodyText.length > 50, 'Renderer не должен быть пустым');
  assert.deepEqual(runtimeErrors, []);

  await window.screenshot({ path: '/private/tmp/markd-packaged-smoke.png' });
  console.log(JSON.stringify({ title, isWindowVisible, bridgeType, pageCount, runtimeErrors }, null, 2));
} finally {
  await electronApp.close();
}
