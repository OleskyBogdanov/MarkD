import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';
import { projectSchema } from '../src/shared/projectSchema';

let app: ElectronApplication;
let window: Page;
let root: string;
let projectPath: string;
let errors: string[];

test.beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'markd-table-selection-'));
  projectPath = join(root, 'selected-table.markd');
  errors = [];
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(root, 'user-data'),
      MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
    }
  });
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, projectPath);
  window = await app.firstWindow();
  window.on('pageerror', (error) => errors.push(error.message));
  await window.getByRole('button', { name: 'Новый проект', exact: true }).click();
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(3);
  await table.scrollIntoViewIfNeeded();
});

test.afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

const drag = async (from: Locator, to: Locator): Promise<void> => {
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  if (!start || !end) throw new Error('Table selection target is not visible');
  await window.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await window.mouse.down();
  await window.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
  await window.mouse.up();
};

test('adds rows and columns beside the table without toolbar service controls', async () => {
  const table = window.getByTestId('table-element').first();
  const toolbar = window.getByRole('region', { name: 'Панель инструментов элемента' });
  for (const name of ['Добавить строку', 'Добавить колонку', 'Выбрать всю таблицу']) {
    await expect(toolbar.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(toolbar.getByRole('status')).toHaveCount(0);
  await expect(toolbar.getByText('Смешанные значения', { exact: true })).toHaveCount(0);
  const addRow = table.getByRole('button', { name: 'Добавить строку таблицы', exact: true });
  await table.locator('.document-table-header').hover();
  const idle = await addRow.evaluate((node) => getComputedStyle(node).backgroundColor);
  await addRow.hover();
  await expect(addRow).not.toHaveCSS('background-color', idle);
  const hovered = await addRow.evaluate((node) => getComputedStyle(node).backgroundColor);
  await window.screenshot({ path: 'output/table-range-refinement/add-row-hover.png' });
  await window.mouse.down();
  await expect(addRow).not.toHaveCSS('background-color', hovered);
  await window.screenshot({ path: 'output/table-range-refinement/add-row-pressed.png' });
  await window.mouse.up();
  await table.getByRole('button', { name: 'Добавить колонку таблицы', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('tbody td')).toHaveCount(12);
  await toolbar.evaluate((node) => { node.scrollLeft = 0; });
  await window.screenshot({ path: 'output/table-range-refinement/controls.png' });
  expect(errors).toEqual([]);
});

test('extends body values through rows and adjacent columns without selecting the header', async () => {
  const table = window.getByTestId('table-element').first();
  const first = await table.locator('tbody tr').first().locator('textarea').first().boundingBox();
  const nextRow = await table.locator('tbody tr').last().locator('textarea').first().boundingBox();
  const nextColumn = await table.locator('tbody tr').last().locator('textarea').nth(1).boundingBox();
  if (!first || !nextRow || !nextColumn) throw new Error('Body selection targets are not visible');
  await window.screenshot({ path: 'output/table-range-refinement/current.png' });
  await window.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await window.mouse.down();
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(1);
  await window.mouse.move(nextRow.x + nextRow.width / 2, nextRow.y + nextRow.height / 2, { steps: 10 });
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(2);
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(0);
  await window.mouse.move(nextColumn.x + nextColumn.width / 2, nextColumn.y + nextColumn.height / 2, { steps: 10 });
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(4);
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(0);
  await window.mouse.up();
  await table.locator('tbody textarea').first().dblclick();
  await table.locator('tbody textarea').first().fill('Редактирование двойным кликом');
  await table.locator('tbody textarea').first().press('Tab');
  await expect(table.locator('tbody textarea').first()).toHaveValue('Редактирование двойным кликом');
  expect(errors).toEqual([]);
});

test('extends native text selection into a cell range when leaving the edited cell', async () => {
  const table = window.getByTestId('table-element').first();
  const editor = table.locator('tbody textarea').first();
  await editor.dblclick();
  await editor.fill('Alpha Beta Gamma');
  const start = await editor.boundingBox();
  const end = await table.locator('tbody tr').last().locator('textarea').nth(1).boundingBox();
  if (!start || !end) throw new Error('Editing selection targets are not visible');
  await window.mouse.move(start.x + 25, start.y + start.height / 2);
  await window.mouse.down();
  await window.mouse.move(start.x + 70, start.y + start.height / 2, { steps: 6 });
  expect(await editor.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBeGreaterThan(0);
  await window.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await window.mouse.up();
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(4);
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(0);
  await expect(editor).toHaveValue('Alpha Beta Gamma');
  expect(errors).toEqual([]);
});

test('contracts a reversed body range without pulling in the header outside the table', async () => {
  const table = window.getByTestId('table-element').first();
  const last = await table.locator('tbody tr').last().locator('td').last().boundingBox();
  const first = await table.locator('tbody tr').first().locator('td').first().boundingBox();
  const header = await table.locator('thead th').first().boundingBox();
  if (!first || !last || !header) throw new Error('Table cells are not visible');
  await window.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await window.mouse.down();
  await window.mouse.move(first.x + first.width / 2, header.y - 20, { steps: 10 });
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(6);
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(0);
  await window.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 10 });
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(1);
  await window.mouse.up();
  await window.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('extends row selection into another page and opens its final cell with F2', async () => {
  const table = window.getByTestId('table-element').first();
  for (let index = 0; index < 24; index += 1) {
    await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  }
  const tables = window.getByTestId('table-element');
  await expect(tables).toHaveCount(2);
  const from = tables.first().getByRole('button', { name: 'Выбрать строку 2', exact: true });
  const to = tables.last().getByRole('button', { name: 'Выбрать строку 27', exact: true });
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox();
  if (!start) throw new Error('First-page selection target is not visible');
  await window.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await window.mouse.down();
  await to.scrollIntoViewIfNeeded();
  const end = await to.boundingBox();
  if (!end) throw new Error('Continuation selection target is not visible');
  await window.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await window.mouse.up();
  await expect(tables.locator('[data-cell-selected="true"]')).toHaveCount(26 * 3);
  await window.keyboard.press('F2');
  const editor = tables.last().locator('tbody tr').last().locator('textarea').first();
  await expect(editor).toBeFocused();
  await window.keyboard.insertText('Ввод на следующей странице');
  await editor.press('Tab');
  await expect(editor).toHaveValue('Ввод на следующей странице');
  expect(errors).toEqual([]);
});

test('keeps row and column deletion available in the toolbar and preserves the last cell', async () => {
  const table = window.getByTestId('table-element').first();
  const toolbar = window.getByRole('region', { name: 'Панель инструментов элемента' });
  await drag(table.getByRole('button', { name: 'Выбрать строку 2', exact: true }),
    table.getByRole('button', { name: 'Выбрать строку 3', exact: true }));
  await toolbar.getByRole('button', { name: 'Действия с таблицей', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Удалить выбранные строки', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(1);
  await drag(table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }),
    table.getByRole('button', { name: 'Выбрать столбец 3', exact: true }));
  await toolbar.getByRole('button', { name: 'Действия с таблицей', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Удалить выбранные столбцы', exact: true }).click();
  await expect(table.locator('th, td')).toHaveCount(1);
  await table.locator('.document-table-header').click();
  await toolbar.getByRole('button', { name: 'Действия с таблицей', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: 'Удалить выбранные строки', exact: true })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Удалить выбранные столбцы', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('drags row, column, and rectangular selections and preserves formatting after reopen', async () => {
  const table = window.getByTestId('table-element').first();
  const toolbar = window.getByRole('region', { name: 'Панель инструментов элемента' });
  await drag(table.getByRole('button', { name: 'Выбрать строку 2', exact: true }), table.getByRole('button', { name: 'Выбрать строку 3', exact: true }));
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(6);
  await toolbar.getByRole('button', { name: 'По правому краю', exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('textarea').first()).toHaveCSS('text-align', 'right');
  await expect(table.locator('thead textarea').first()).toHaveCSS('text-align', 'left');

  await drag(table.getByRole('button', { name: 'Выбрать столбец 1', exact: true }), table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }));
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(6);
  await toolbar.getByRole('button', { name: 'По центру', exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('textarea').first()).toHaveCSS('text-align', 'center');
  await expect(table.locator('tbody tr').first().locator('textarea').nth(2)).toHaveCSS('text-align', 'right');

  await drag(table.getByRole('button', { name: 'Выбрать ячейку 2, 1', exact: true }), table.getByRole('button', { name: 'Выбрать ячейку 3, 2', exact: true }));
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(4);
  await toolbar.getByLabel('Размер текста, px', { exact: true }).fill('17');
  await toolbar.getByLabel('Размер текста, px', { exact: true }).press('Enter');
  await toolbar.getByRole('button', { name: 'Курсив', exact: true }).click();
  await expect(table.locator('tbody textarea').first()).toHaveCSS('font-style', 'italic');
  await expect(table.locator('thead textarea').first()).toHaveCSS('font-style', 'normal');
  await expect(toolbar.getByRole('combobox', { name: 'Область выравнивания' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Наследовать', exact: true })).toHaveCount(0);
  await window.getByRole('button', { name: /^Сохранить(?: ·)?$/ }).click();
  await expect(window.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  const saved = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
  const savedTable = saved.pages[0].elements.find((element) => element.type === 'table');
  expect(savedTable?.rows[1].cells[0].style).toMatchObject({ fontSize: 17, italic: true, align: 'center' });
  expect(savedTable?.rows[0].cells[0].style?.fontSize).toBeUndefined();
  await window.getByRole('button', { name: 'Файл', exact: true }).click();
  await window.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  await expect(window.getByText(/Открыт selected-table.markd/)).toBeVisible();
  await expect(table.locator('tbody textarea').first()).toHaveCSS('font-style', 'italic');
  expect(errors).toEqual([]);
});

test('supports keyboard range extension, whole-table selection and direct cell editing', async () => {
  const table = window.getByTestId('table-element').first();
  const toolbar = window.getByRole('region', { name: 'Панель инструментов элемента' });
  const row = table.getByRole('button', { name: 'Выбрать строку 2', exact: true });
  await row.focus();
  await row.press('Space');
  await row.press('Shift+ArrowDown');
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(6);
  await toolbar.getByRole('button', { name: 'По нижнему краю', exact: true }).click();
  await expect(table.locator('tbody td').first()).toHaveCSS('vertical-align', 'bottom');
  await expect(table.locator('thead th').first()).toHaveCSS('vertical-align', 'middle');
  await table.locator('.document-table-header').click();
  await expect(toolbar.getByRole('button', { name: 'Выбрать всю таблицу', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('status')).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'По центру', exact: true }).click();
  await expect(table.locator('thead textarea').first()).toHaveCSS('text-align', 'center');

  const cell = table.getByRole('button', { name: 'Выбрать ячейку 2, 1', exact: true });
  await cell.focus();
  await cell.press('Space');
  await cell.press('F2');
  const editor = table.locator('tbody textarea').first();
  await expect(editor).toBeFocused();
  await editor.fill('Обычное редактирование');
  await editor.press('Tab');
  await expect(editor).toHaveValue('Обычное редактирование');
  await expect(table.getByTestId('table-column-resize-1')).toBeVisible();
  await expect(table.getByTestId('table-row-resize-2')).toBeVisible();
  expect(errors).toEqual([]);
});

test('selects the intended rows with pointer targets at minimum zoom', async () => {
  const table = window.getByTestId('table-element').first();
  await window.getByRole('region', { name: 'Рабочая область документа' })
    .dispatchEvent('wheel', { ctrlKey: true, deltaY: 10000, cancelable: true });
  await expect(window.getByLabel('Текущий масштаб', { exact: true })).toHaveText('25%');
  await table.getByRole('button', { name: 'Выбрать строку 1', exact: true }).click();
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(3);
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(0);
  await drag(table.getByRole('button', { name: 'Выбрать строку 1', exact: true }),
    table.getByRole('button', { name: 'Выбрать строку 3', exact: true }));
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(9);
  await drag(table.getByRole('button', { name: 'Выбрать столбец 1', exact: true }),
    table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }));
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(6);
  await drag(table.getByRole('button', { name: 'Выбрать ячейку 2, 1', exact: true }),
    table.getByRole('button', { name: 'Выбрать ячейку 3, 2', exact: true }));
  await expect(table.locator('tbody [data-cell-selected="true"]')).toHaveCount(4);
  await expect(table.locator('thead [data-cell-selected="true"]')).toHaveCount(0);
  await window.screenshot({ path: 'output/table-interaction-update/selection-25-percent.png' });
  const heading = table.getByRole('textbox', { name: 'Заголовок блока', exact: true });
  await heading.dblclick();
  await heading.fill('Заголовок при 25%');
  await heading.press('Tab');
  await expect(heading).toHaveValue('Заголовок при 25%');
  expect(errors).toEqual([]);
});

test('warns about the painted uppercase table heading and clears the warning when it fits', async () => {
  const table = window.getByTestId('table-element').first();
  const resize = table.getByRole('button', { name: 'Изменить размер таблицы', exact: true });
  await resize.scrollIntoViewIfNeeded();
  const widthBefore = await table.evaluate(node => node.getBoundingClientRect().width);
  const handle = await resize.boundingBox();
  if (!handle) throw new Error('Table resize handle is not visible');
  await window.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await window.mouse.down();
  await window.mouse.move(handle.x + handle.width / 2 - 350, handle.y + handle.height / 2, { steps: 12 });
  await window.mouse.up();
  await expect.poll(() => table.evaluate(node => node.getBoundingClientRect().width)).toBeLessThan(widthBefore - 300);
  await expect(table.locator('.overflow-warning')).toHaveCount(0);
  const heading = table.getByRole('textbox', { name: 'Заголовок блока', exact: true });
  await heading.dblclick();
  await heading.fill('l'.repeat(80));
  await expect(table.locator('.overflow-warning')).toBeVisible();
  await heading.fill('Позиции');
  await expect(table.locator('.overflow-warning')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const italicColumn of [0, 1]) {
  test(`preserves mixed italics when changing the selected row font, italic column ${italicColumn + 1}`, async () => {
    const table = window.getByTestId('table-element').first();
    const toolbar = window.getByRole('region', { name: 'Панель инструментов элемента' });
    const row = table.locator('tbody tr').first();
    const originalFamily = await row.locator('textarea').first().evaluate((node) => getComputedStyle(node).fontFamily);
    const expected = [0, 1, 2].map((column) => column === italicColumn ? 'italic' : 'normal');
    await table.getByRole('button', { name: `Выбрать ячейку 2, ${italicColumn + 1}`, exact: true }).click();
    await toolbar.getByRole('button', { name: 'Курсив', exact: true }).click();
    await table.getByRole('button', { name: 'Выбрать строку 2', exact: true }).click();
    await expect(toolbar.getByRole('button', { name: 'Курсив', exact: true })).toHaveAttribute('aria-pressed', 'mixed');
    await expect(toolbar.getByText('Смешанные значения', { exact: true })).toHaveCount(0);
    await toolbar.getByRole('combobox', { name: 'Шрифт', exact: true }).selectOption('pt-serif');
    for (const [column, italic] of expected.entries()) {
      await expect(row.locator('textarea').nth(column)).toHaveCSS('font-family', /MarkD PT Serif/);
      await expect(row.locator('textarea').nth(column)).toHaveCSS('font-style', italic);
    }
    await window.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(row.locator('textarea').first()).toHaveCSS('font-family', originalFamily);
    await window.getByRole('button', { name: 'Повторить', exact: true }).click();
    await window.getByRole('button', { name: /^Сохранить(?: ·)?$/ }).click();
    await expect(window.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Файл', exact: true }).click();
    await window.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
    await expect(window.getByText(/Открыт selected-table.markd/)).toBeVisible();
    for (const [column, italic] of expected.entries()) {
      await expect(row.locator('textarea').nth(column)).toHaveCSS('font-family', /MarkD PT Serif/);
      await expect(row.locator('textarea').nth(column)).toHaveCSS('font-style', italic);
    }
    expect(errors).toEqual([]);
  });
}
