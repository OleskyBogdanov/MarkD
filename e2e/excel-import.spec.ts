import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { projectSchema } from '../src/shared/projectSchema';
import { writeExcelFixture } from './fixtures/excelWorkbook';

let app: ElectronApplication;
let page: Page;
let directory: string;
let workbookPath: string;
let projectPath: string;
let runtimeErrors: string[];

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-excel-e2e-'));
  workbookPath = join(directory, 'catalog.xlsx');
  projectPath = join(directory, 'proposal.markd');
  writeExcelFixture(workbookPath);
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'),
      MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
    }
  });
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async (_window, options) => ({
      canceled: false,
      filePaths: [options?.filters?.some(filter => filter.extensions.includes('xlsx')) ? paths.workbook : paths.project]
    });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.project });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, { workbook: workbookPath, project: projectPath });
  page = await app.firstWindow();
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await page.locator('.app-shell').waitFor();
});

test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app: nativeApp }) => nativeApp.exit(0));
    await app.close();
  }
  rmSync(directory, { recursive: true, force: true });
  expect(runtimeErrors).toEqual([]);
});

const fillButton = () => page.getByRole('button', { name: 'Заполнить таблицу из Excel', exact: true });
const saveButton = () => page.getByRole('button', { name: /^Сохранить(?: ·)?$/ });

const importWorkbook = async (): Promise<void> => {
  await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
  await expect(fillButton()).toBeVisible();
};

const prepareTarget = async (headers?: readonly string[], locked = false): Promise<void> => {
  await saveButton().click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  const project = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
  const table = project.pages[0].elements.find(element => element.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Expected proposal table');
  project.layers.find(layer => layer.id === table.layerId)!.locked = locked;
  if (headers) {
    table.columns = headers.map((_, index) => `column-${index}`);
    table.rows[0].cells = headers.map((text, index) => ({
      id: `heading-${index}`, text, widthMm: text === 'Наименование' ? 80 : 25
    }));
  } else {
    table.columns.push('total-column');
    table.rows[0].cells.push({ id: 'total-heading', text: 'Сумма', widthMm: 35 });
  }
  writeFileSync(projectPath, JSON.stringify(project));
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  if (locked) {
    await expect(page.getByRole('columnheader', { name: 'Сумма', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 4', exact: true }))
      .toHaveValue(headers?.[3] ?? 'Сумма');
  }
};

test('imports chosen variants with AVR into mapped columns and preserves undo and saved values', async () => {
  await prepareTarget();
  await importWorkbook();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await fillButton().click();
  const dialog = page.getByRole('dialog', { name: 'Заполнить таблицу из Excel' });
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'С АВР AD-TEST-1', exact: true }).check();
  await dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-2', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Исполнение AD-TEST-2', exact: true }).selectOption('open');
  await expect(dialog.getByRole('region', { name: 'Предпросмотр вставки' })).toContainText('1 121 798');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(dialog).toBeHidden();
  const firstName = 'Дизельный генератор AD-TEST-1 в шумозащитном евро кожухе с АВР TestEngine (ENGINE-1)';
  const names = page.getByRole('textbox', { name: 'Ячейка таблицы 1', exact: true });
  await expect(names.nth(1)).toHaveValue(firstName);
  expect(await names.nth(1).evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await expect(names.nth(2)).toHaveValue('Дизельный генератор AD-TEST-2 TestEngine (ENGINE-2)');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(names).toHaveCount(1);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(names.nth(1)).toHaveValue(firstName);
  await saveButton().click();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  const stored = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
  const table = stored.pages[0].elements.find(element => element.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Expected saved table');
  expect(table.rows.slice(1).map(row => row.cells.map(cell => cell.text))).toEqual([
    [firstName, '2', '560 899 р.', '1 121 798 р.'],
    ['Дизельный генератор AD-TEST-2 TestEngine (ENGINE-2)', '1', '450 000 р.', '450 000 р.']
  ]);
  await page.getByRole('button', { name: 'Файл', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  await expect(names.nth(1)).toHaveValue(firstName);
});

test('explains incompatible tables and cancels selection without changing the document', async () => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await prepareTarget(undefined, true);
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Нет доступных таблиц/)).toBeVisible();
  expect(await dialog.locator('.excel-fill-body').evaluate(node =>
    node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Готово', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Выбрано AD-TEST-1', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'С АВР AD-TEST-1', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(fillButton()).toBeFocused();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(1);
});

test('rejects invalid quantities and empty mappings and keeps editor shortcuts inside the dialog', async () => {
  await prepareTarget();
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true }).fill('0');
  await expect(dialog.getByRole('alert')).toContainText('положительным целым');
  await expect(dialog.getByRole('button', { name: 'Готово', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true }).fill('');
  await expect(dialog.getByRole('button', { name: 'Готово', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true }).fill('1');
  for (const select of await dialog.getByRole('group', { name: 'Настройка вставки' }).getByRole('combobox').all()) {
    await select.selectOption('skip');
  }
  await expect(dialog.getByText('Настройте заполнение хотя бы одной колонки', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Готово', exact: true })).toBeDisabled();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'new-document' });
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 4', exact: true })).toHaveValue('Сумма');
});

test('keeps the previous catalog after a corrupt replacement or canceled file selection', async () => {
  await importWorkbook();
  writeFileSync(workbookPath, 'not an xlsx file');
  await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Не удалось импортировать Excel' })).toBeVisible();
  await fillButton().click();
  await expect(page.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
  await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Импортировать Excel', exact: true })).toBeEnabled();
  await fillButton().click();
  await expect(page.getByRole('button', { name: 'Выбрать AD-TEST-2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  writeExcelFixture(workbookPath, 1);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, workbookPath);
  await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Импортировать Excel', exact: true })).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Не удалось импортировать Excel' })).toBeHidden();
  await fillButton().click();
  await expect(page.getByRole('button', { name: 'Выбрать AD-TEST-2', exact: true })).toHaveCount(0);
});

test('chooses a worksheet explicitly and clears choices when the sheet changes', async () => {
  writeExcelFixture(workbookPath, 2, 2);
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Лист Excel', exact: true })).toHaveValue('sheet-1');
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Лист Excel', exact: true }).selectOption('sheet-2');
  await expect(dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('status')).toHaveText('Выбрано позиций: 0');
});

test('canceling while fonts load prevents a delayed insertion', async () => {
  await prepareTarget();
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  const releaseFonts = await page.evaluateHandle(() => {
    let release = (): void => {};
    const ready = new Promise<void>(resolve => { release = resolve; });
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => ready });
    return release;
  });
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Готово', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toBeHidden();
  await releaseFonts.evaluate(release => release());
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 1', exact: true })).toHaveCount(1);
});

test('native menu undo and redo edit quantity without touching document history', async () => {
  await prepareTarget();
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  const quantity = dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true });
  await quantity.focus();
  await quantity.press('ControlOrMeta+a');
  await quantity.pressSequentially('27');
  await expect(quantity).toHaveValue('27');
  const nativeMenu = (label: string) => app.evaluate(({ Menu, BrowserWindow }, name) => {
    const window = BrowserWindow.getAllWindows()[0];
    const command = Menu.getApplicationMenu()?.items.find(item => item.label === 'Команда')
      ?.submenu?.items.find(item => item.label === name);
    if (!command || !window) throw new Error('Native command menu unavailable');
    command.click({}, window, window.webContents);
  }, label);
  await nativeMenu('Отменить');
  await expect(quantity).toHaveValue('1');
  await nativeMenu('Повторить');
  await expect(quantity).toHaveValue('27');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 4', exact: true })).toHaveValue('Сумма');
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
});

test('configures every actual column including numbering, units, skipped values and rubles', async () => {
  const headers = ['№', 'Наименование', 'Ед.', 'Количество', 'Цена', 'Сумма', 'Примечание'];
  await prepareTarget(headers);
  await importWorkbook();
  await fillButton().click();
  const dialog = page.getByRole('dialog');
  const settings = dialog.getByRole('group', { name: 'Настройка вставки' });
  await expect(settings.getByRole('combobox')).toHaveCount(7);
  for (const [index, header] of headers.entries()) {
    await expect(settings.getByRole('combobox', { name: `Заполнение колонки ${index + 1}: ${header}`, exact: true }))
      .toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'С АВР AD-TEST-1', exact: true }).check();
  await dialog.getByRole('spinbutton', { name: 'Количество AD-TEST-1', exact: true }).fill('2');
  await settings.getByRole('textbox', { name: 'Единица для колонки 3: Ед.', exact: true }).fill('компл.');
  await settings.getByRole('combobox', { name: 'Заполнение колонки 5: Цена', exact: true }).selectOption('total');
  await settings.getByRole('combobox', { name: 'Заполнение колонки 6: Сумма', exact: true }).selectOption('price');
  const preview = dialog.getByRole('region', { name: 'Предпросмотр вставки' });
  await expect(preview.locator('thead th')).toHaveText(headers);
  await expect(preview.locator('tbody tr').first().locator('td')).toHaveText([
    '1', 'Дизельный генератор AD-TEST-1 в шумозащитном евро кожухе с АВР TestEngine (ENGINE-1)',
    'компл.', '2', '1 121 798 р.', '560 899 р.', ''
  ]);
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 1', exact: true }).nth(1)).toHaveValue('1');
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 3', exact: true }).nth(1)).toHaveValue('компл.');
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 5', exact: true }).nth(1)).toHaveValue('1 121 798 р.');
  await fillButton().click();
  await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Предпросмотр вставки' }).locator('tbody td').first()).toHaveText('2');
  await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ячейка таблицы 1', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await saveButton().click();
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  const saved = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
  const table = saved.pages[0].elements.find(element => element.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Expected saved table');
  expect(table.rows.slice(1).map(row => row.cells[0].text)).toEqual(['1', '2']);
  expect(table.rows[1].cells[6].text).toBe('');
  expect(table.rows[1].cells[5].text).toBe('560 899 р.');
});
