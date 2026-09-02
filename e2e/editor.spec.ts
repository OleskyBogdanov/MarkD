import { existsSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';

const projectPath = '/private/tmp/markd-e2e-proposal.markd';
const legacyProjectPath = '/private/tmp/markd-e2e-legacy.kpdoc';
const convertedLegacyProjectPath = '/private/tmp/markd-e2e-legacy.markd';
const pdfPath = '/private/tmp/markd-e2e-proposal.pdf';
const userDataPath = '/private/tmp/markd-e2e-user-data';
const imagePath = '/System/Library/Automator/Send Birthday Greetings.action/Contents/Resources/4.jpg';
const screenshotPaths = {
  editor: '/private/tmp/markd-e2e-editor.png',
  field: '/private/tmp/markd-e2e-text-field.png',
  table: '/private/tmp/markd-e2e-table-long.png',
  preview: '/private/tmp/markd-e2e-preview.png',
  narrow: '/private/tmp/markd-e2e-narrow.png'
} as const;

let electronApp: ElectronApplication;
let window: Page;
let runtimeErrors: string[];

test.beforeEach(async () => {
  rmSync(userDataPath, { recursive: true, force: true });
  for (const path of [projectPath, legacyProjectPath, convertedLegacyProjectPath, pdfPath, ...Object.values(screenshotPaths)]) {
    if (existsSync(path)) unlinkSync(path);
  }

  runtimeErrors = [];
  electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:40173',
      MARKD_USER_DATA_DIR: userDataPath,
      MARKD_E2E_HEADLESS: '1'
    }
  });

  await electronApp.evaluate(async ({ dialog }, paths) => {
    dialog.showOpenDialog = async (_baseWindow, options) => ({
      canceled: false,
      filePaths: [options?.filters?.some((filter) => filter.extensions?.some((extension) => extension === 'markd' || extension === 'kpdoc')) ? paths.projectPath : paths.imagePath]
    });
    dialog.showSaveDialog = async (_baseWindow, options) => ({
      canceled: false,
      filePath: options?.filters?.some((filter) => filter.extensions?.includes('pdf'))
        ? paths.pdfPath
        : paths.projectPath
    });
  }, { imagePath, pdfPath, projectPath });

  window = await electronApp.firstWindow();
  window.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      runtimeErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  window.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  await window.getByTestId('start-screen').waitFor({ state: 'visible', timeout: 15_000 });
  await window.getByRole('button', { name: 'Новый проект' }).click();
  await window.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 });
});

test.afterEach(async () => {
  await electronApp?.close();
});

const dragBy = async (handle: Locator, deltaX: number, deltaY: number): Promise<void> => {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(startX + deltaX, startY + deltaY, { steps: 6 });
  await window.mouse.up();
};

const addElement = async (name: RegExp): Promise<void> => {
  await window.getByRole('button', { name: 'Добавить', exact: true }).click();
  await window.getByRole('menuitem', { name }).click();
};

test('shows the MarkD project screen and preserves history across core actions', async () => {
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false);
  await expect(window).toHaveTitle(/MarkD/);
  await expect(window.getByText('MARKD', { exact: true })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Настройки проекта' })).toBeVisible();
  await expect.poll(() => window.evaluate(() => typeof window.desktop)).toBe('object');

  await window.getByRole('button', { name: 'К проектам' }).click();
  await expect(window.getByTestId('start-screen')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Недавние', exact: true })).toBeVisible();
  await expect(window.getByText('Недавних проектов пока нет')).toBeVisible();
  await window.getByRole('button', { name: 'Новый проект' }).click();

  const pages = window.getByTestId('editor-page');
  const textElements = window.getByTestId('text-element');
  const initialPageCount = await pages.count();
  const initialTextCount = await textElements.count();

  await addElement(/^Страница/);
  await expect(pages).toHaveCount(initialPageCount + 1);

  await addElement(/^Текст Свободный/);
  await expect(textElements).toHaveCount(initialTextCount + 1);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect(textElements).toHaveCount(initialTextCount);

  await window.getByRole('button', { name: 'Повторить' }).click();
  await expect(textElements).toHaveCount(initialTextCount + 1);
  expect(runtimeErrors).toEqual([]);
});

test('opens a saved project from the recent projects screen', async () => {
  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);

  await window.getByRole('button', { name: 'К проектам' }).click();
  const recentProject = window.getByRole('button', { name: 'Открыть проект markd-e2e-proposal' });
  await expect(recentProject).toBeVisible();
  await expect(recentProject).toContainText('markd-e2e-proposal');
  await recentProject.click();

  await expect(window.locator('.app-shell')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Настройки проекта' })).toBeVisible();
  await expect(window.getByText(/Открыт markd-e2e-proposal.markd/)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('writes renderer diagnostics to the application data logs', async () => {
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  const logPath = join(userDataPath, 'logs', `markd-${new Date().toISOString().slice(0, 10)}.log`);
  const marker = `e2e-renderer-log-${Date.now()}`;
  await window.evaluate((message) => {
    window.dispatchEvent(new ErrorEvent('error', { message, error: new Error(message) }));
  }, marker);
  await expect.poll(() => existsSync(logPath) && readFileSync(logPath, 'utf8').includes(marker)).toBe(true);
});

test('creates, saves and exports a proposal without image/table overlap', async () => {
  const textElements = window.getByTestId('text-element');
  await textElements.first().locator('textarea').fill('Коммерческое предложение для ООО «Альтаир»');

  await addElement(/^Текст Свободный/);
  await textElements.nth(1).locator('textarea').fill('ООО «Праздник Про»');

  await addElement(/^Текст Свободный/);
  await textElements.nth(2).locator('textarea').fill(
    'Организация корпоративного мероприятия под ключ: концепция, декор, кейтеринг и техническое сопровождение.'
  );

  const tableInputs = window.locator('.table-element textarea');
  await tableInputs.nth(0).fill('Организация мероприятия');
  await tableInputs.nth(1).fill('1');
  await tableInputs.nth(2).fill('120 000 ₽');

  await addElement(/^Изображение/);
  await expect(window.getByTestId('image-element')).toHaveCount(1);
  await expect(window.getByTestId('image-element').locator('img')).toBeVisible();

  const imageBox = await window.getByTestId('image-element').boundingBox();
  const tableBox = await window.getByTestId('table-element').boundingBox();
  expect(imageBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(tableBox!.y);

  await window.getByTestId('table-element').click({ position: { x: 2, y: 2 } });
  await expect(window.getByRole('heading', { name: 'Таблица' })).toBeVisible();
  const tableY = window.getByLabel('Y, мм');
  await tableY.fill('158');
  await expect(tableY).toHaveValue('158');

  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  await expect(window.getByText(/Сохранено:/)).toBeVisible();

  const savedProject = JSON.parse(readFileSync(projectPath, 'utf8')) as { pages: unknown[]; assets: unknown[] };
  expect(savedProject.pages).toHaveLength(1);
  expect(savedProject.assets).toHaveLength(1);

  await window.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect.poll(() => existsSync(pdfPath)).toBe(true);
  await expect.poll(() => statSync(pdfPath).size).toBeGreaterThan(1_000);
  await expect(window.getByText(/PDF готов:/)).toBeVisible();

  await window.screenshot({ path: screenshotPaths.editor, fullPage: false });
  expect(runtimeErrors).toEqual([]);
});

test('moves a text block and restores its position with Undo', async () => {
  const textElement = window.getByTestId('text-element').first();
  const before = await textElement.boundingBox();
  expect(before).not.toBeNull();

  await expect(textElement.getByTestId('text-drag-handle')).toHaveCount(0);
  await textElement.getByRole('textbox', { name: 'Текст на странице' }).click();
  await expect(textElement.getByTestId('text-drag-handle')).toBeVisible();
  await dragBy(textElement.getByTestId('text-drag-handle'), 56, 34);
  const after = await textElement.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x - before!.x).toBeGreaterThan(40);
  expect(after!.y - before!.y).toBeGreaterThan(20);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await textElement.boundingBox())?.x).toBeCloseTo(before!.x, 0);
  await expect.poll(async () => (await textElement.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('moves a table and restores its position with Undo', async () => {
  const tableElement = window.getByTestId('table-element').first();
  const before = await tableElement.boundingBox();
  expect(before).not.toBeNull();

  await expect(tableElement.getByTestId('table-drag-handle')).toHaveCount(0);
  await tableElement.locator('.document-table-header').click({ position: { x: 40, y: 10 } });
  await expect(tableElement.getByTestId('table-drag-handle')).toBeVisible();
  await dragBy(tableElement.getByTestId('table-drag-handle'), 48, 28);
  const after = await tableElement.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x - before!.x).toBeGreaterThan(32);
  expect(after!.y - before!.y).toBeGreaterThan(16);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await tableElement.boundingBox())?.x).toBeCloseTo(before!.x, 0);
  await expect.poll(async () => (await tableElement.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('moves an image like other canvas components and restores it with Undo', async () => {
  await addElement(/^Изображение/);
  const imageElement = window.getByTestId('image-element');
  const before = await imageElement.boundingBox();
  expect(before).not.toBeNull();

  await expect(imageElement.getByTestId('image-drag-handle')).toHaveCount(0);
  await imageElement.locator('img').click();
  const dragHandle = imageElement.getByTestId('image-drag-handle');
  await expect(dragHandle).toBeVisible();
  await expect(imageElement.getByRole('button', { name: 'Изменить размер изображения' })).toBeVisible();

  await dragBy(dragHandle, 52, 30);
  const after = await imageElement.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x - before!.x).toBeGreaterThan(36);
  expect(after!.y - before!.y).toBeGreaterThan(18);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await imageElement.boundingBox())?.x).toBeCloseTo(before!.x, 0);
  await expect.poll(async () => (await imageElement.boundingBox())?.y).toBeCloseTo(before!.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('isolates layers and persists text/table styling', async () => {
  await window.getByRole('button', { name: 'Добавить слой' }).click();
  await expect(window.getByRole('button', { name: /^Слой 2 \d+$/ })).toHaveAttribute('aria-pressed', 'true');
  await window.getByRole('button', { name: 'Переименовать Слой 2' }).click();
  await window.getByRole('textbox', { name: 'Новое название слоя' }).fill('Изображения');
  await window.getByRole('button', { name: 'Сохранить название' }).click();
  await expect(window.getByRole('button', { name: /^Изображения \d+$/ })).toHaveAttribute('aria-pressed', 'true');
  await addElement(/^Текст Свободный/);
  const layeredText = window.getByTestId('text-element').last();
  await layeredText.getByRole('textbox', { name: 'Текст на странице' }).fill('Текст второго слоя');

  await window.getByRole('button', { name: /^Основной \d+$/ }).click();
  await expect(layeredText.getByRole('textbox', { name: 'Текст на странице' })).toHaveCount(0);
  await expect(layeredText.locator('.presentation-text')).toContainText('Текст второго слоя');

  await window.getByRole('button', { name: /^Изображения \d+$/ }).click();
  await layeredText.getByRole('textbox', { name: 'Текст на странице' }).click();
  const textColor = window.getByLabel('Цвет текста: HEX');
  await textColor.fill('#123456');
  await textColor.press('Enter');
  await expect.poll(() => layeredText.getByRole('textbox').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(18, 52, 86)');

  await window.getByRole('button', { name: /^Основной \d+$/ }).click();
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await window.getByLabel('Выравнивание колонки 1').selectOption('center');
  await expect.poll(() => table.locator('textarea').first().evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');
  await window.getByLabel('Выравнивание строки 1').selectOption('right');
  await expect.poll(() => table.locator('textarea').first().evaluate((node) => getComputedStyle(node).textAlign)).toBe('right');

  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    layers: unknown[];
    pages: Array<{ elements: Array<{ type: string; layerId: string; style?: { color?: string; columnAlign?: Record<string, string>; rowAlign?: Record<string, string> } }> }>;
  };
  expect(saved.layers).toHaveLength(2);
  expect(saved.pages[0].elements.find((element) => element.type === 'text' && element.style?.color === '#123456')).toBeTruthy();
  const savedTable = saved.pages[0].elements.find((element) => element.type === 'table');
  expect(Object.values(savedTable?.style?.columnAlign ?? {})).toContain('center');
  expect(Object.values(savedTable?.style?.rowAlign ?? {})).toContain('right');
  expect(runtimeErrors).toEqual([]);
});

test('configures table title, header, rows, columns and borders', async () => {
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await expect(window.getByRole('heading', { name: 'Таблица' })).toBeVisible();

  const heightBefore = (await table.boundingBox())?.height ?? 0;
  await window.getByRole('checkbox', { name: 'Показывать заголовок блока' }).uncheck();
  await expect(table.locator('.document-table-header')).toHaveCount(0);
  await expect.poll(async () => (await table.boundingBox())?.height ?? 0).toBeLessThan(heightBefore);

  await window.getByRole('button', { name: 'Добавить строку', exact: true }).click();
  await window.getByRole('button', { name: 'Добавить строку', exact: true }).click();
  await window.getByRole('checkbox', { name: 'Чередовать цвет строк' }).check();
  await window.getByLabel('Чётные строки: HEX').fill('#ddeeff');
  await window.getByLabel('Чётные строки: HEX').press('Enter');
  await window.getByLabel('Размер текста, px').fill('13');
  await window.getByLabel('Высота строки, px').fill('46');
  await window.getByLabel('Отступ ячейки, px').fill('10');
  await window.getByLabel('По вертикали').selectOption('bottom');
  await window.getByLabel('Толщина, px').fill('2');
  await window.getByLabel('Стиль границы').selectOption('dashed');
  await window.getByLabel('Ширина колонки 1').fill('80');

  await expect(table.locator('thead th')).toHaveCount(3);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect.poll(() => table.locator('tbody tr').nth(1).locator('td').first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(221, 238, 255)');
  await expect.poll(() => table.locator('thead th').first().evaluate((node) => ({
    borderStyle: getComputedStyle(node).borderTopStyle,
    borderWidth: getComputedStyle(node).borderTopWidth,
    verticalAlign: getComputedStyle(node).verticalAlign
  }))).toEqual({ borderStyle: 'dashed', borderWidth: '2px', verticalAlign: 'bottom' });
  await expect.poll(() => table.locator('thead textarea').first().evaluate((node) => ({
    fontSize: getComputedStyle(node).fontSize,
    fontWeight: getComputedStyle(node).fontWeight,
    paddingLeft: getComputedStyle(node).paddingLeft
  }))).toEqual({ fontSize: '13px', fontWeight: '700', paddingLeft: '10px' });

  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    pages: Array<{ elements: Array<{ type: string; showPageHeader?: boolean; style?: Record<string, unknown> }> }>;
  };
  expect(saved.pages[0].elements.find((element) => element.type === 'table')).toMatchObject({
    showPageHeader: false,
    style: { alternatingRows: true, alternateRowColor: '#ddeeff', rowHeight: 46, cellPadding: 10, borderStyle: 'dashed', borderWidth: 2 }
  });
  expect(runtimeErrors).toEqual([]);
});

test('opens a clean document preview and returns to editing', async () => {
  const textElement = window.getByTestId('text-element').first();
  await textElement.getByRole('textbox', { name: 'Текст на странице' }).click();
  await expect(textElement.getByTestId('text-drag-handle')).toBeVisible();

  await window.getByRole('button', { name: 'Открыть предпросмотр' }).click();
  await expect(window.locator('.app-shell')).toHaveClass(/preview-mode/);
  await expect(window.locator('.inspector-col')).toBeHidden();
  await expect(window.locator('.page-meta').first()).toBeHidden();
  await expect(textElement.getByTestId('text-drag-handle')).toHaveCount(0);

  await window.getByRole('button', { name: 'Вернуться к редактированию' }).click();
  await expect(window.locator('.app-shell')).not.toHaveClass(/preview-mode/);
  await expect(window.locator('.inspector-col')).toBeVisible();
});

test('opens and upgrades an existing schemaVersion 1 project', async () => {
  writeFileSync(legacyProjectPath, JSON.stringify({
    schemaVersion: 1,
    metadata: { title: 'Архивное КП' },
    orientation: 'portrait',
    pages: [{
      id: 'legacy-page',
      widthMm: 210,
      heightMm: 297,
      background: null,
      flowStartYmm: 8,
      elements: [{
        id: 'legacy-text',
        type: 'text',
        rect: { x: 16, y: 16, width: 178, height: 24 },
        text: 'Документ из предыдущей версии',
        style: { fontFamily: 'Arial', fontSize: 14, bold: false, italic: false, align: 'center' },
        zIndex: 0
      }]
    }],
    assets: [],
    styles: {}
  }), 'utf8');

  await electronApp.evaluate(async ({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, legacyProjectPath);

  await window.getByRole('button', { name: /^Открыть(?: \.markd)?$/ }).click();
  await expect(window.getByRole('heading', { name: 'Архивное КП' })).toBeVisible();
  const legacyText = window.getByTestId('text-element').getByRole('textbox', { name: 'Текст на странице' });
  await expect(legacyText).toHaveValue('Документ из предыдущей версии');
  await expect.poll(() => legacyText.evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');

  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(convertedLegacyProjectPath)).toBe(true);
  await expect.poll(() => (JSON.parse(readFileSync(convertedLegacyProjectPath, 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(3);
  expect(runtimeErrors).toEqual([]);
});

test('edits fields, alignment, long content, clean preview, reopening and PDF', async () => {
  test.setTimeout(60_000);
  await window.setViewportSize({ width: 1440, height: 900 });
  await window.screenshot({ path: screenshotPaths.editor, fullPage: false });

  const inspector = window.locator('.inspector-col');
  const inspectorWidthBefore = (await inspector.boundingBox())?.width ?? 0;
  await dragBy(window.getByRole('separator', { name: 'Изменить ширину правой панели' }), -64, 0);
  await expect.poll(async () => (await inspector.boundingBox())?.width ?? 0).toBeGreaterThan(inspectorWidthBefore + 50);

  await addElement(/^Текстовое поле/);
  const textField = window.getByTestId('text-field-element');
  await expect(textField).toHaveCount(1);
  await expect(window.getByRole('heading', { name: 'Текстовое поле' })).toBeVisible();
  await window.getByLabel('Подпись', { exact: true }).fill('Email клиента');
  await window.getByLabel('Значение').fill('sales.department.with.a.very.long.address@example-company.test');
  await window.getByLabel('Placeholder', { exact: true }).fill('name@example.com');
  await window.getByLabel('Иконка Lucide').selectOption('mail');
  await window.getByLabel('Иконка: HEX').fill('#c2410c');
  await window.getByLabel('Иконка: HEX').press('Enter');
  await window.getByRole('checkbox', { name: 'Прозрачный фон' }).check();
  await window.getByRole('checkbox', { name: 'Показывать границу' }).uncheck();
  await window.getByRole('checkbox', { name: 'Показывать подпись' }).uncheck();
  await window.getByRole('checkbox', { name: 'Показывать placeholder' }).uncheck();
  await expect(textField.locator('.field-label')).toHaveCount(0);
  await expect(textField.locator('input')).toHaveAttribute('placeholder', '');
  await expect.poll(() => textField.locator('.field-leading').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(194, 65, 12)');
  await expect.poll(() => textField.locator('.field-control').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => textField.locator('.field-control').evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px');
  await window.getByRole('button', { name: 'По центру' }).click();
  await expect(window.getByRole('button', { name: 'По центру' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => textField.locator('input').evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');

  const widthControl = window.getByLabel('Ширина, мм');
  await widthControl.fill('112');
  await expect(widthControl).toHaveValue('112');
  await expect.poll(() => textField.locator('input').evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');
  await window.getByRole('button', { name: 'По правому краю' }).click();
  await expect.poll(() => textField.locator('input').evaluate((node) => getComputedStyle(node).textAlign)).toBe('right');
  await window.getByRole('button', { name: 'По левому краю' }).click();
  await expect.poll(() => textField.locator('input').evaluate((node) => getComputedStyle(node).textAlign)).toBe('left');
  await window.screenshot({ path: screenshotPaths.field, fullPage: false });

  await addElement(/^Выпадающий список/);
  const selectField = window.getByTestId('select-field-element');
  await expect(selectField).toHaveCount(1);
  await window.getByLabel('Подпись', { exact: true }).fill('Пакет услуг');
  await window.getByLabel('Placeholder', { exact: true }).fill('Выберите пакет услуг');
  await window.getByRole('button', { name: 'Добавить вариант' }).click();
  await window.getByRole('textbox', { name: 'Вариант 3', exact: true }).fill('Премиальный пакет с очень длинным названием для международного коммерческого предложения');
  const selectedOptionId = await window.getByLabel('Выбранный вариант').locator('option').nth(3).getAttribute('value');
  expect(selectedOptionId).toBeTruthy();
  await window.getByLabel('Выбранный вариант').selectOption(selectedOptionId!);
  await expect(selectField.locator('select')).toHaveValue(selectedOptionId!);

  await addElement(/^Таблица/);
  const tables = window.getByTestId('table-element');
  await expect(tables).toHaveCount(2);
  const newTable = tables.nth(1);
  await newTable.locator('textarea').nth(0).fill('Очень длинное русское значение без выхода за границы компонента и с корректным переносом строк');
  await newTable.locator('textarea').nth(1).fill('LongEnglishValueWithoutSpacesThatMustWrapInsideTheTableCellWithoutBreakingTheDocument');
  await window.screenshot({ path: screenshotPaths.table, fullPage: false });

  await addElement(/^Текст Свободный/);
  const newText = window.getByTestId('text-element').last();
  await newText.getByRole('textbox', { name: 'Текст на странице' }).fill('Первая строка с длинным русским текстом\nSecond line with a very long English value that must wrap inside the fixed frame.');
  await window.getByLabel('Высота, мм').fill('6');
  await expect(newText.locator('.overflow-warning')).toBeVisible();

  await window.getByRole('button', { name: 'Открыть предпросмотр' }).click();
  await expect(window.locator('.app-shell')).toHaveClass(/mode-preview/);
  await expect(window.locator('.inspector-col')).toHaveCount(0);
  await expect(window.locator('.page-meta')).toHaveCount(0);
  await expect(window.locator('.hint')).toHaveCount(0);
  await expect(window.getByTestId('editor-overlay')).toHaveCount(0);
  await expect(window.locator('.canvas-col input, .canvas-col textarea, .canvas-col select')).toHaveCount(0);
  await expect(window.getByRole('button', { name: /^Удалить строку/ })).toHaveCount(0);
  await expect(window.locator('.status-toast')).toHaveCount(0);
  await expect(window.getByText('sales.department.with.a.very.long.address@example-company.test')).toBeVisible();
  await expect(textField.locator('.field-label')).toHaveCount(0);
  await expect.poll(() => textField.locator('.field-presentation').evaluate((node) => ({
    display: getComputedStyle(node).display,
    alignContent: getComputedStyle(node).alignContent
  }))).toEqual({ display: 'grid', alignContent: 'center' });
  await window.screenshot({ path: screenshotPaths.preview, fullPage: false });

  await window.getByRole('button', { name: 'Вернуться к редактированию' }).click();
  await expect(textField.locator('input')).toHaveValue('sales.department.with.a.very.long.address@example-company.test');
  await expect(selectField.locator('select')).toHaveValue(selectedOptionId!);

  await window.setViewportSize({ width: 1024, height: 768 });
  await expect(window.locator('.app-header')).toBeVisible();
  await expect.poll(() => window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await window.screenshot({ path: screenshotPaths.narrow, fullPage: false });

  await window.getByRole('button', { name: /Сохранить/ }).click();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    schemaVersion: number;
    pages: Array<{ elements: Array<{
      type: string;
      showLabel?: boolean;
      showPlaceholder?: boolean;
      style?: { iconColor?: string; backgroundTransparent?: boolean; borderVisible?: boolean };
    }> }>;
  };
  expect(saved.schemaVersion).toBe(3);
  expect(saved.pages[0].elements.find((element) => element.type === 'textField')).toMatchObject({
    showLabel: false,
    showPlaceholder: false,
    style: { iconColor: '#c2410c', backgroundTransparent: true, borderVisible: false }
  });
  expect(saved.pages[0].elements.some((element) => element.type === 'selectField')).toBe(true);

  await window.getByRole('button', { name: /^Открыть(?: \.markd)?$/ }).click();
  await expect(window.getByText(/Открыт markd-e2e-proposal.markd/)).toBeVisible();
  await expect(window.getByTestId('text-field-element').locator('input')).toHaveValue('sales.department.with.a.very.long.address@example-company.test');
  await expect(window.getByTestId('text-field-element').locator('.field-label')).toHaveCount(0);
  await expect.poll(() => window.getByTestId('text-field-element').locator('.field-control').evaluate((node) => ({
    backgroundColor: getComputedStyle(node).backgroundColor,
    borderTopWidth: getComputedStyle(node).borderTopWidth
  }))).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px' });

  await window.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect.poll(() => existsSync(pdfPath)).toBe(true);
  await expect.poll(() => statSync(pdfPath).size).toBeGreaterThan(1_000);
  for (const path of Object.values(screenshotPaths)) {
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1_000);
  }
  expect(runtimeErrors).toEqual([]);
});
