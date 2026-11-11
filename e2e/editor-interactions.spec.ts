import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { projectSchema } from '../src/shared/projectSchema';

let app: ElectronApplication;
let page: Page;
let directory: string;
let filePath: string;
let errors: string[];

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-interactions-'));
  filePath = join(directory, 'interactions.markd');
  errors = [];
  app = await electron.launch({ args: ['.'], env: {
    ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'),
    MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
  } });
  await app.evaluate(({ dialog }, { filePath, imagePath }) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imagePath] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, { filePath, imagePath: resolve('build/icon.png') });
  page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
});

test.afterEach(async () => {
  await app.close();
  rmSync(directory, { recursive: true, force: true });
  expect(errors).toEqual([]);
});

test('renames the document in the header and saves the last characters without blur', async () => {
  const title = page.getByRole('textbox', { name: 'Название документа', exact: true });
  await title.fill('Название из заголовка');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect.poll(() => existsSync(filePath)).toBe(true);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Название из заголовка', exact: true })).toBeVisible();
  const project = projectSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
  expect(project.metadata.title).toBe('Название из заголовка');
});

for (const edit of [{ value: 'Отменённое имя', key: 'Escape' }, { value: '', key: 'Enter' }] as const) {
  test(`retains the document name when ${edit.key} rejects the title draft`, async () => {
    const title = page.getByRole('textbox', { name: 'Название документа', exact: true });
    const original = await title.inputValue();
    await title.fill(edit.value);
    await title.press(edit.key);
    await expect(title).toHaveValue(original);
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  });
}

test('changes only the active page background directly from the toolbar', async () => {
  const toolbar = page.getByRole('region', { name: 'Панель инструментов элемента' });
  await expect(toolbar.getByRole('button', { name: 'Документ', exact: true })).toHaveCount(0);
  const color = toolbar.getByLabel('Фон страницы: HEX', { exact: true });
  await expect(color).toBeVisible();
  await color.fill('#123456');
  await color.press('Enter');
  const pages = page.getByTestId('editor-page');
  await expect(pages.first().locator('.page-bg')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Страница/ }).click();
  await expect(pages).toHaveCount(2);
  await color.fill('#abcdef');
  await color.press('Enter');
  await expect(pages.nth(1).locator('.page-bg')).toHaveCSS('background-color', 'rgb(171, 205, 239)');
  await expect(pages.first().locator('.page-bg')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await pages.first().locator('.page').click({ position: { x: 8, y: 8 } });
  await expect(color).toHaveValue('#123456');
});

for (const width of [1440, 1024, 700]) {
  test(`keeps the canvas origin fixed when changing element types at ${width}px`, async () => {
    const canvas = page.getByRole('region', { name: 'Рабочая область документа' });
    const toolbar = page.getByRole('region', { name: 'Панель инструментов элемента' });
    await page.setViewportSize({ width, height: 900 });
    await canvas.evaluate((node) => { node.scrollTop = 0; });
    await canvas.click({ position: { x: 6, y: 6 } });
    const top = await canvas.evaluate((node) => node.getBoundingClientRect().top);
    const sheet = page.getByTestId('editor-page').first().locator('.page');
    const sheetTop = await sheet.evaluate((node) => node.getBoundingClientRect().top);
    await page.getByTestId('text-element').first().getByRole('textbox').click();
    await expect.poll(() => canvas.evaluate((node) => node.getBoundingClientRect().top)).toBe(top);
    await expect.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().top)).toBe(sheetTop);
    await page.getByTestId('table-element').first().locator('.document-table-header').click();
    await expect.poll(() => canvas.evaluate((node) => node.getBoundingClientRect().top)).toBe(top);
    for (const name of [/^Прямоугольник/, /^Текстовое поле/, /^Выпадающий список/, /^Изображение/]) {
      await page.getByRole('button', { name: 'Добавить', exact: true }).click();
      await page.getByRole('menuitem', { name }).click();
      await expect.poll(() => canvas.evaluate((node) => node.getBoundingClientRect().top)).toBe(top);
      await expect(toolbar).toHaveCSS('height', '84px');
      await expect.poll(() => toolbar.evaluate((node) => node.scrollLeft)).toBe(0);
    }
  });
}

test('Ctrl wheel zooms the document while ordinary wheel scrolls and preview also supports zoom', async () => {
  const canvas = page.getByRole('region', { name: 'Рабочая область документа' });
  const percent = page.getByLabel('Текущий масштаб', { exact: true });
  const sheet = page.getByTestId('editor-page').first().locator('.page');
  const header = page.locator('.app-header');
  const headerHeight = await header.evaluate((node) => node.getBoundingClientRect().height);
  const initialWidth = await sheet.evaluate((node) => node.getBoundingClientRect().width);
  const initialPercent = await percent.innerText();
  await canvas.hover({ position: { x: 100, y: 100 } });
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(initialWidth);
  await expect(percent).not.toHaveText(initialPercent);
  await expect.poll(() => header.evaluate((node) => node.getBoundingClientRect().height)).toBe(headerHeight);
  const enlarged = await sheet.evaluate((node) => node.getBoundingClientRect().width);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  await expect.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(enlarged);
  const restoredPercent = await percent.innerText();
  const scrollTop = await canvas.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, 160);
  await expect.poll(() => canvas.evaluate((node) => node.scrollTop)).toBeGreaterThan(scrollTop);
  await expect(percent).toHaveText(restoredPercent);
  await page.getByRole('button', { name: 'Открыть предпросмотр', exact: true }).click();
  const previewWidth = await sheet.evaluate((node) => node.getBoundingClientRect().width);
  await canvas.hover({ position: { x: 100, y: 100 } });
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect.poll(() => sheet.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(previewWidth);
  await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: -10000, cancelable: true });
  await expect(percent).toHaveText('200%');
  await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: 10000, cancelable: true });
  await expect(percent).toHaveText('25%');
});

test('explains the preview button on hover and keyboard focus', async () => {
  const preview = page.getByRole('button', { name: 'Открыть предпросмотр', exact: true });
  const hint = page.getByRole('tooltip', { name: 'Предпросмотр документа', exact: true });
  await expect(hint).toHaveCount(0);
  await preview.hover();
  await expect(hint).toBeVisible();
  await page.getByRole('textbox', { name: 'Название документа', exact: true }).hover();
  await expect(hint).toHaveCount(0);
  await preview.focus();
  await expect(hint).toBeVisible();
});
