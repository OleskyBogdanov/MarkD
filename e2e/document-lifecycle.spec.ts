import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MenuCommandPayload } from '../src/shared/ipc-channels';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

let app: ElectronApplication;
let page: Page;
let directory: string;
let filePath: string;

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-lifecycle-'));
  filePath = join(directory, 'document.markd');
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'), MARKD_E2E_HEADLESS: '1' }
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
  }, filePath);
  page = await app.firstWindow();
  // Hidden Windows CI windows otherwise throttle animation frames to about 1 Hz.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
});

test.afterEach(async () => {
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app?.close().catch(() => {});
  rmSync(directory, { recursive: true, force: true });
});

const menu = (command: MenuCommandPayload['command']): Promise<void> =>
  app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: value }), command);

const storedText = (): string => {
  const project = JSON.parse(readFileSync(filePath, 'utf8')) as { pages: Array<{ elements: Array<{ type: string; text?: string }> }> };
  return project.pages[0].elements.find(element => element.type === 'text')?.text ?? '';
};

test('immediate save includes the last characters without leaving the field', async () => {
  const text = page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first();
  await text.fill('Before');
  await text.blur();
  await menu('save');
  await expect.poll(() => { try { return storedText(); } catch { return ''; } }).toBe('Before');
  const previousMtime = statSync(filePath).mtimeMs;
  await text.fill('Last characters');
  await text.press('Control+s');
  await expect.poll(() => statSync(filePath).mtimeMs).toBeGreaterThan(previousMtime);
  expect(storedText()).toBe('Last characters');
});

test('cancel keeps a dirty native window open', async () => {
  await page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first().fill('Unsaved');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Unsaved');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('save completion leaves subsequent edits dirty', async () => {
  await menu('save');
  await expect.poll(() => { try { return storedText().length; } catch { return 0; } }).toBeGreaterThan(0);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('project:save');
    ipcMain.handle('project:save', (_event, payload: { path: string }) => new Promise(resolve => {
      (globalThis as unknown as { releaseSave: () => void }).releaseSave = () => resolve(payload.path);
    }));
  });
  await menu('save');
  await expect(page.getByRole('status').filter({ hasText: 'Сохраняю документ' })).toBeVisible();
  const text = page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first();
  await text.fill('Changed during save');
  await text.blur();
  await app.evaluate(() => (globalThis as unknown as { releaseSave: () => void }).releaseSave());
  await expect(page.getByRole('button', { name: 'Сохранить ·', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Есть несохранённые изменения' })).toBeVisible();
});

test('save-dialog cancellation and write errors keep the document open', async () => {
  const text = page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first();
  await text.fill('Keep me');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.locator('[inert]')).toHaveCount(0);
  await expect(text).toHaveValue('Keep me');
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('project:saveAs');
    ipcMain.handle('project:saveAs', () => { throw new Error('EACCES: test denied'); });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.getByRole('status').filter({ hasText: 'EACCES' })).toBeVisible();
  await expect(text).toHaveValue('Keep me');
});

test('quit saves the latest text before terminating', async () => {
  await page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first().fill('Saved on quit');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => {});
  await closed;
  expect(storedText()).toBe('Saved on quit');
});

test('crash recovery restores the last persisted draft on the next launch', async () => {
  await page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first().fill('Recovered after crash');
  const recoveryPath = join(directory, 'profile', 'recovery.json');
  await expect.poll(() => { try { return readFileSync(recoveryPath, 'utf8'); } catch { return ''; } }).toContain('Recovered after crash');
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app.close().catch(() => {});
  app = await electron.launch({ args: ['.'], env: { ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'), MARKD_E2E_HEADLESS: '1' } });
  page = await app.firstWindow();
  // Hidden Windows CI windows otherwise throttle animation frames to about 1 Hz.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.getByRole('button', { name: 'Восстановить черновик' }).click();
  await expect(page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Recovered after crash');
  await expect(page.getByRole('button', { name: 'Сохранить ·', exact: true })).toBeVisible();
  expect(existsSync(filePath)).toBe(false);
});

test('active page, page deletion and native history operate on the correct document', async () => {
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Страница/ }).click();
  await expect(page.getByRole('combobox', { name: 'Текущая страница' })).toHaveValue(await page.getByTestId('editor-page').nth(1).getAttribute('data-page-id') ?? '');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Текст Свободный/ }).click();
  await expect(page.getByTestId('editor-page').nth(1).getByTestId('text-element')).toHaveCount(1);
  await page.getByRole('button', { name: 'По ширине', exact: true }).focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.getByTestId('editor-page')).toHaveCount(2);
  await expect(page.getByTestId('editor-page').nth(1).getByTestId('text-element')).toHaveCount(0);
  await menu('redo');
  await expect(page.getByTestId('editor-page').nth(1).getByTestId('text-element')).toHaveCount(1);
  await page.getByRole('button', { name: 'Удалить страницу', exact: true }).click();
  await expect(page.getByTestId('editor-page')).toHaveCount(1);
  await menu('undo');
  await expect(page.getByTestId('editor-page')).toHaveCount(2);
});

test('new document exits preview and native text deletion does not delete its object', async () => {
  await page.getByRole('button', { name: 'Открыть предпросмотр' }).click();
  await menu('new-document');
  await expect(page.locator('.mode-edit')).toBeVisible();
  const text = page.getByRole('textbox', { name: 'Текст на странице', exact: true }).first();
  await text.fill('abcd');
  await text.press('End');
  await menu('delete');
  await expect(page.getByTestId('text-element')).toHaveCount(1);
  await expect(text).toBeVisible();
});

test('a template opens as an unsaved new document and leaves the source unchanged', async () => {
  await menu('save');
  await expect.poll(() => existsSync(filePath)).toBe(true);
  const original = readFileSync(filePath, 'utf8');
  await page.getByRole('button', { name: 'К проектам' }).click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, filePath);
  await page.getByRole('button', { name: 'Из шаблона…' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить ·', exact: true })).toBeVisible();
  const copy = join(directory, 'from-template.markd');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, copy);
  await menu('save');
  await expect.poll(() => existsSync(copy)).toBe(true);
  expect(readFileSync(filePath, 'utf8')).toBe(original);
  expect(JSON.parse(readFileSync(copy, 'utf8')).metadata.id).not.toBe(JSON.parse(original).metadata.id);
});

test('truncated embedded images are rejected without replacing the current document', async () => {
  await menu('save');
  await expect.poll(() => existsSync(filePath)).toBe(true);
  const project = JSON.parse(readFileSync(filePath, 'utf8'));
  project.pages[0].background = { type: 'image', value: 'data:image/png;base64,iVBORw0KGgo=' };
  const corrupt = join(directory, 'corrupt.markd');
  writeFileSync(corrupt, JSON.stringify(project));
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, corrupt);
  await menu('open');
  await expect(page.getByRole('status').filter({ hasText: 'Изображение повреждено' })).toBeVisible();
  await expect(page.getByTestId('text-element')).toHaveCount(1);
});

test('fit width keeps the page in the visible canvas at 1024px', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
  await page.getByRole('button', { name: 'По ширине', exact: true }).click();
  const canvas = await page.locator('.canvas-col').boundingBox();
  const paper = await page.locator('.page').first().boundingBox();
  expect(paper!.width).toBeLessThan(canvas!.width);
  await page.getByRole('button', { name: 'Свойства', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Инспектор свойств' })).toHaveCount(0);
});
