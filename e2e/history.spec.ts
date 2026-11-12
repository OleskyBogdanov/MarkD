import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

let app: ElectronApplication;
let page: Page;
let directory: string;
let errors: string[];

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-history-'));
  errors = [];
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: directory,
      MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
    }
  });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  const table = page.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await table.getByRole('button', { name: 'Выбрать столбец 1', exact: true }).click();
});

test.afterEach(async () => {
  await app.evaluate(({ app: nativeApp }) => nativeApp.exit(0));
  await app.close();
  rmSync(directory, { recursive: true, force: true });
  expect(errors).toEqual([]);
});

for (const entry of ['toolbar', 'keyboard', 'menu'] as const) {
  test(`undo and redo column color from ${entry} while color input keeps focus`, async () => {
    const table = page.getByTestId('table-element').first();
    const cell = table.locator('tbody td').first();
    const originalColor = await cell.evaluate(node => getComputedStyle(node).backgroundColor);
    await page.getByRole('button', { name: 'Цвета', exact: true }).click();
    const color = page.getByLabel('Фон: выбор цвета', { exact: true });
    await color.fill('#123456');
    await color.focus();
    await expect(cell).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(color).toBeFocused();
    const command = async (redo: boolean): Promise<void> => {
      if (entry === 'toolbar') {
        // Keyboard activation preserves the previous field focus on macOS too.
        await page.getByRole('button', { name: redo ? 'Повторить' : 'Отменить', exact: true })
          .dispatchEvent('click');
      } else if (entry === 'keyboard') {
        await page.keyboard.press(redo ? 'ControlOrMeta+Shift+z' : 'ControlOrMeta+z');
      } else {
        await app.evaluate(({ BrowserWindow }, name) => {
          BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: name });
        }, redo ? 'redo' : 'undo');
      }
    };
    await command(false);
    await expect(cell).toHaveCSS('background-color', originalColor);
    await command(true);
    await expect(cell).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  });
}

test('toolbar undo flushes a focused text draft and redo restores it', async () => {
  const cell = page.getByTestId('table-element').first().locator('tbody textarea').first();
  await cell.dblclick();
  await cell.fill('Изменение перед отменой');
  await expect(cell).toBeFocused();
  await page.getByRole('button', { name: 'Отменить', exact: true }).dispatchEvent('click');
  await expect(cell).toHaveValue('');
  await page.getByRole('button', { name: 'Повторить', exact: true }).dispatchEvent('click');
  await expect(cell).toHaveValue('Изменение перед отменой');
});

test('keyboard undo and redo preserve the native history of text being edited', async () => {
  const cell = page.getByTestId('table-element').first().locator('tbody textarea').first();
  await cell.dblclick();
  await cell.pressSequentially('Alpha');
  await cell.press('ControlOrMeta+z');
  await expect(cell).toHaveValue('Alph');
  await cell.press('ControlOrMeta+Shift+z');
  await expect(cell).toHaveValue('Alpha');
});

test('toolbar undo commits the focused HEX draft before traversing history', async () => {
  const table = page.getByTestId('table-element').first();
  const cell = table.locator('tbody td').first();
  const original = await cell.evaluate(node => getComputedStyle(node).backgroundColor);
  await page.getByRole('button', { name: 'Цвета', exact: true }).click();
  const hex = page.getByRole('textbox', { name: 'Фон: HEX', exact: true });
  await hex.fill('#123456');
  await expect(hex).toBeFocused();
  await page.getByRole('button', { name: 'Отменить', exact: true }).dispatchEvent('click');
  await expect(cell).toHaveCSS('background-color', original);
  await page.getByRole('button', { name: 'Повторить', exact: true }).dispatchEvent('click');
  await expect(cell).toHaveCSS('background-color', 'rgb(18, 52, 86)');
});

for (const kind of ['rows', 'columns'] as const) {
  test(`deleting multiple selected ${kind} is one undo and redo operation`, async () => {
    const table = page.getByTestId('table-element').first();
    if (kind === 'rows') {
      await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
    }
    const first = kind === 'rows' ? 'Выбрать строку 2' : 'Выбрать столбец 1';
    const last = kind === 'rows' ? 'Выбрать строку 3' : 'Выбрать столбец 2';
    await table.getByRole('button', { name: first, exact: true }).click();
    await table.getByRole('button', { name: last, exact: true }).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Действия с таблицей', exact: true }).click();
    await page.getByRole('button', {
      name: kind === 'rows' ? 'Удалить выбранные строки' : 'Удалить выбранные столбцы', exact: true
    }).click();
    const remaining = kind === 'rows' ? table.locator('tr') : table.locator('thead th');
    await expect(remaining).toHaveCount(1);
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(remaining).toHaveCount(3);
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(remaining).toHaveCount(1);
  });
}

test('separate column resize gestures remain separate undo steps', async () => {
  const table = page.getByTestId('table-element').first();
  const cell = table.locator('thead th').first();
  const width = () => cell.evaluate(node => getComputedStyle(node).width);
  const original = await width();
  const resize = async (distance: number): Promise<void> => {
    const handle = table.getByTestId('table-column-resize-1');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    if (!box) throw new Error('Resize handle is not visible');
    const startY = box.y + Math.min(12, box.height / 4);
    await page.mouse.move(box.x + box.width / 2, startY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + distance, startY, { steps: 4 });
    await page.mouse.up();
  };
  await resize(25);
  const middle = await width();
  expect(middle).not.toBe(original);
  await resize(25);
  const after = await width();
  expect(after).not.toBe(middle);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(cell).toHaveCSS('width', middle);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(cell).toHaveCSS('width', original);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(cell).toHaveCSS('width', middle);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(cell).toHaveCSS('width', after);
});
