import { mkdtempSync, copyFileSync, existsSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';
import { projectSchema, type KpProject } from '../src/shared/projectSchema';

const testRoot = mkdtempSync(join(tmpdir(), 'markd-editor-'));
const projectPath = join(testRoot, 'markd-e2e-proposal.markd');
const legacyProjectPath = join(testRoot, 'markd-e2e-legacy.kpdoc');
const convertedLegacyProjectPath = join(testRoot, 'markd-e2e-legacy.markd');
const templatePath = join(testRoot, 'markd-e2e-template.markd');
const pdfPath = join(testRoot, 'markd-e2e-proposal.pdf');
const userDataPath = join(testRoot, 'markd-e2e-user-data');
const transferredProjectPath = join(testRoot, 'markd-e2e-transferred.markd');
const transferredUserDataPath = join(testRoot, 'markd-e2e-transferred-user-data');
const imagePath = resolve('build/icon.png');
const bundledFontFamilies = [
  'MarkD Golos Text', 'MarkD Inter', 'MarkD Roboto', 'MarkD Open Sans', 'MarkD Montserrat',
  'MarkD Manrope', 'MarkD PT Sans', 'MarkD Noto Sans', 'MarkD Source Sans 3', 'MarkD Rubik',
  'MarkD PT Serif', 'MarkD Noto Serif', 'MarkD Source Serif 4', 'MarkD Merriweather', 'MarkD Roboto Slab',
  'MarkD Lora', 'MarkD Playfair Display', 'MarkD Literata', 'MarkD JetBrains Mono', 'MarkD Roboto Mono'
] as const;
const screenshotPaths = {
  editor: join(testRoot, 'markd-e2e-editor.png'),
  field: join(testRoot, 'markd-e2e-text-field.png'),
  table: join(testRoot, 'markd-e2e-table-long.png'),
  preview: join(testRoot, 'markd-e2e-preview.png'),
  narrow: join(testRoot, 'markd-e2e-narrow.png')
} as const;
const shapePanelScreenshotPath = join(testRoot, 'markd-e2e-shape-panel.png');

// Windows CI needs a visible native window: hidden-window compositor input
// remains throttled even with Electron backgroundThrottling disabled.
const hiddenTestWindow = !(process.env.CI && process.platform === 'win32');

let electronApp: ElectronApplication;
let window: Page;
let runtimeErrors: string[];

test.beforeEach(async () => {
  rmSync(userDataPath, { recursive: true, force: true });
  rmSync(transferredUserDataPath, { recursive: true, force: true });
  for (const path of [projectPath, templatePath, transferredProjectPath, legacyProjectPath, convertedLegacyProjectPath, pdfPath, shapePanelScreenshotPath, ...Object.values(screenshotPaths)]) {
    if (existsSync(path)) unlinkSync(path);
  }

  runtimeErrors = [];
  electronApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MARKD_USER_DATA_DIR: userDataPath,
      MARKD_E2E_HEADLESS: hiddenTestWindow ? '1' : '0'
    }
  });

  await electronApp.evaluate(async ({ dialog }, paths) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    dialog.showOpenDialog = async (_baseWindow, options) => ({
      canceled: false,
      filePaths: [options?.filters?.some((filter) => filter.extensions?.some((extension) => extension === 'markd' || extension === 'kpdoc')) ? paths.projectPath : paths.imagePath]
    });
    dialog.showSaveDialog = async (_baseWindow, options) => {
      const isPdf = options?.filters?.some((filter) => filter.extensions?.includes('pdf'));
      const isTemplate = options?.filters?.some((filter) => filter.name === 'Шаблон MarkD');
      return {
        canceled: false,
        filePath: isPdf ? paths.pdfPath : isTemplate ? paths.templatePath : paths.projectPath
      };
    };
  }, { imagePath, pdfPath, projectPath, templatePath });

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

test.afterAll(() => rmSync(testRoot, { recursive: true, force: true }));

test.afterEach(async () => {
  await electronApp?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await electronApp?.close().catch(() => {});
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

// Selection and dragging may scroll the canvas. Compare document coordinates,
// so viewport scrolling cannot look like an object move (or break Undo checks).
const positionOnPage = async (element: Locator): Promise<{ x: number; y: number }> =>
  element.evaluate((node) => {
    const page = node.closest('.page');
    if (!page) throw new Error('Canvas element must belong to a document page');
    const bounds = node.getBoundingClientRect();
    const pageBounds = page.getBoundingClientRect();
    return { x: bounds.x - pageBounds.x, y: bounds.y - pageBounds.y };
  });

const addElement = async (name: RegExp): Promise<void> => {
  await window.getByRole('button', { name: 'Добавить', exact: true }).click();
  await window.getByRole('menuitem', { name }).click();
};

const elementToolbar = (): Locator => window.locator('.element-toolbar');

const openInspectorSection = async (name: string): Promise<Locator> => {
  const trigger = elementToolbar().getByRole('button', { name, exact: true });
  if (await trigger.getAttribute('aria-expanded') === 'false') {
    if (await elementToolbar().locator('.inspector-section-content:popover-open').count()) await window.keyboard.press('Escape');
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
};

const saveFileFromMenu = async (): Promise<void> => {
  await window.getByRole('button', { name: /^Сохранить(?: ·)?$/ }).click();
};

// Geometry is fixture data now that the toolbar exposes only pointer editing.
// Start from a real saved project and load the adjusted file through Open.
const openGeometryFixture = async (configure: (project: KpProject) => void): Promise<void> => {
  await saveFileFromMenu();
  await expect(window.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const project = JSON.parse(readFileSync(projectPath, 'utf8')) as KpProject;
  configure(project);
  writeFileSync(projectPath, JSON.stringify(project), 'utf8');
  await window.getByRole('button', { name: 'Файл', exact: true }).click();
  await window.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  await expect(window.getByText(/Открыт markd-e2e-proposal.markd/)).toBeVisible();
};

const expectNoGeometryControls = async (): Promise<void> => {
  await expect(elementToolbar().getByRole('button', { name: 'Положение', exact: true })).toHaveCount(0);
  for (const label of ['X, мм', 'Y, мм', 'Ширина, мм', 'Высота, мм']) {
    await expect(elementToolbar().getByLabel(label, { exact: true })).toHaveCount(0);
  }
};

const expectFullPageImage = async (image: Locator): Promise<void> => {
  const page = window.getByTestId('editor-page').first().locator('.page');
  await expect.poll(async () => {
    const [imageBox, pageBox] = await Promise.all([image.boundingBox(), page.boundingBox()]);
    if (!imageBox || !pageBox) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(imageBox.x - pageBox.x), Math.abs(imageBox.y - pageBox.y),
      Math.abs(imageBox.width - pageBox.width), Math.abs(imageBox.height - pageBox.height)
    );
  }).toBeLessThan(1);
};

const pdfPageCount = (path: string): number =>
  readFileSync(path).toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;

test('shows the MarkD project screen and preserves history across core actions', async () => {
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(!hiddenTestWindow);
  await expect(window).toHaveTitle(/MarkD/);
  await expect(window.getByText('MARKD', { exact: true })).toBeVisible();
  await expect(window.getByText('Выберите элемент, чтобы переместить его, изменить размер или настроить свойства.', { exact: true })).toHaveCount(0);
  await expect(elementToolbar().getByLabel('Фон страницы: HEX', { exact: true })).toBeVisible();
  await expect(window.getByRole('textbox', { name: 'Название документа', exact: true })).toBeVisible();
  await expect.poll(() => window.evaluate(() => typeof window.desktop)).toBe('object');
  await expect(window.locator('.document-readout svg')).toHaveCount(0);

  await window.getByRole('button', { name: 'К проектам' }).click();
  await expect(window.getByTestId('start-screen')).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Недавние', exact: true })).toBeVisible();
  await expect(window.getByText('Недавних проектов пока нет')).toBeVisible();
  await window.getByRole('button', { name: 'Новый проект' }).click();

  const pages = window.getByTestId('editor-page');
  const textElements = window.getByTestId('text-element');
  await expect(pages).toHaveCount(1);
  const initialPageCount = await pages.count();
  const initialTextCount = await textElements.count();

  await expect(window.locator('.canvas-col')).toHaveCSS('padding-bottom', '36px');
  await expect(window.locator('.page-item').last()).toHaveCSS('margin-bottom', '0px');

  const addTrigger = window.getByRole('button', { name: 'Добавить', exact: true });
  await addTrigger.focus();
  await addTrigger.press('ArrowDown');
  const firstAddItem = window.getByRole('menuitem', { name: /^Текст Свободный/ });
  const lastAddItem = window.getByRole('menuitem', { name: /^Страница Новый/ });
  await expect(firstAddItem).toBeFocused();
  await firstAddItem.press('End');
  await expect(lastAddItem).toBeFocused();
  await lastAddItem.press('Escape');
  await expect(addTrigger).toBeFocused();
  await expect(lastAddItem).toHaveCount(0);

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

test('saves a template copy and keeps Command or Control S bound to file saving', async () => {
  await addElement(/^Текст Свободный/);
  const saveTrigger = window.getByRole('button', { name: 'Файл', exact: true });

  await saveTrigger.focus();
  await saveTrigger.press('ArrowDown');
  const openFileItem = window.getByRole('menuitem', { name: 'Открыть', exact: true });
  const saveFileItem = window.getByRole('menuitem', { name: /^Сохранить файл/ });
  const saveTemplateItem = window.getByRole('menuitem', { name: /^Сохранить как шаблон/ });
  await expect(window.getByRole('menu').getByRole('menuitem')).toHaveText([
    /^Открыть/, /^Сохранить файл/, /^Сохранить как…/, /^Сохранить копию…/, /^Сохранить как шаблон/
  ]);
  await expect(openFileItem).toBeFocused();
  await openFileItem.press('ArrowDown');
  await expect(saveFileItem).toBeFocused();
  await saveFileItem.press('End');
  await expect(saveTemplateItem).toBeFocused();
  await saveTemplateItem.press('Escape');
  await expect(saveTrigger).toBeFocused();
  await expect(saveTemplateItem).toHaveCount(0);

  await saveTrigger.click();
  await window.getByRole('menuitem', { name: /^Сохранить как шаблон/ }).click();
  await expect.poll(() => existsSync(templatePath)).toBe(true);
  await expect(window.getByText(/Шаблон сохранён:/)).toBeVisible();
  await expect(window.getByRole('button', { name: 'Сохранить ·', exact: true })).toBeVisible();
  expect(existsSync(projectPath)).toBe(false);

  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  await expect(window.getByText(/Сохранено:/)).toBeVisible();
  await expect(window.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('opens a saved project from the recent projects screen', async () => {
  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);

  await window.getByRole('button', { name: 'К проектам' }).click();
  const recentProject = window.getByRole('button', { name: 'Открыть проект markd-e2e-proposal' });
  await expect(recentProject).toBeVisible();
  await expect(recentProject).toContainText('markd-e2e-proposal');
  await recentProject.click();

  await expect(window.locator('.app-shell')).toBeVisible();
  await expect(elementToolbar().getByLabel('Фон страницы: HEX', { exact: true })).toBeVisible();
  await expect(window.getByRole('textbox', { name: 'Название документа', exact: true })).toBeVisible();
  await expect(window.getByText(/Открыт markd-e2e-proposal.markd/)).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('loads all 20 bundled document fonts without system dependencies', async () => {
  await window.getByTestId('text-element').first().getByRole('textbox', { name: 'Текст на странице' }).click();
  const fontSelect = elementToolbar().getByLabel('Шрифт');
  await expect(fontSelect.locator('option')).toHaveCount(20);

  const loaded = await window.evaluate(async (families) => Promise.all(families.map(async (family) => {
    const faces = await document.fonts.load(`400 16px "${family}"`, 'Ая Ёё № ₽ —');
    return faces.length > 0;
  })), bundledFontFamilies);
  expect(loaded).toEqual(bundledFontFamilies.map(() => true));
});

for (const kind of ['text', 'shape', 'textField', 'selectField', 'table'] as const) {
  test(`edits ${kind} typography directly and preserves rendered styling after reopening`, async () => {
    const additions = {
      shape: /^Прямоугольник/,
      textField: /^Текстовое поле/,
      selectField: /^Выпадающий список/
    };
    if (kind === 'shape' || kind === 'textField' || kind === 'selectField') {
      await addElement(additions[kind]);
    }
    const testIds = {
      text: 'text-element', shape: 'shape-element', textField: 'text-field-element',
      selectField: 'select-field-element', table: 'table-element'
    };
    const element = window.getByTestId(testIds[kind]).last();
    if (kind === 'text') await element.getByRole('textbox').click();
    if (kind === 'table') await element.locator('.document-table-header').click();
    const toolbar = elementToolbar();
    const font = toolbar.getByRole('combobox', { name: 'Шрифт', exact: true });
    const size = toolbar.getByLabel(kind === 'text' || kind === 'shape' ? 'Размер, px' : 'Размер текста, px', { exact: true });
    const color = toolbar.getByLabel('Цвет текста: выбор цвета', { exact: true });
    await expect(toolbar.locator('.inspector-section-content:visible')).toHaveCount(0);
    await expect(font).toBeVisible();
    await expect(size).toBeVisible();
    await expect(color).toBeVisible();
    await expect(color).toHaveAttribute('type', 'color');
    const hex = toolbar.getByLabel('Цвет текста: HEX', { exact: true });
    await expect(hex).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Оформление', exact: true })).toHaveCount(0);
    await expect(toolbar.getByRole('button', { name: 'Содержание', exact: true })).toHaveCount(0);
    const controlCenters = await toolbar.locator(
      '.format-font select, .format-size input, .color-control input[type="color"], .inspector-section-toggle'
    ).evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 0).map((node) => {
      const box = node.getBoundingClientRect();
      return box.y + box.height / 2;
    }));
    expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(1);
    await window.evaluate(() => document.fonts.ready);
    for (const width of [390, 1440, 1920]) {
      await window.setViewportSize({ width, height: 900 });
      for (const colorScheme of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme });
        await toolbar.evaluate((node) => { node.scrollLeft = 0; });
        await window.screenshot({ path: `output/table-interaction-update/${kind}-${width}-${colorScheme}.png` });
      }
    }
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.emulateMedia({ colorScheme: 'light' });
    await expectNoGeometryControls();
    if (kind === 'textField') {
      await expect(toolbar.getByRole('button', { name: 'Текст', exact: true })).toHaveCount(0);
      await expect(toolbar.getByRole('group', { name: 'Вертикальное выравнивание', exact: true })).toBeVisible();
    }
    if (kind === 'shape') {
      await expect(toolbar.getByRole('button', { name: 'Текст', exact: true })).toHaveCount(0);
      await element.dblclick();
      await element.getByRole('textbox', { name: 'Текст фигуры' }).fill('Прямое оформление');
      await element.getByRole('textbox', { name: 'Текст фигуры' }).press('Escape');
    }
    if (kind === 'table') {
      await element.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
      await expect(toolbar.getByRole('button', { name: 'Выбрать всю таблицу', exact: true })).toHaveCount(0);
    }
    await font.selectOption('pt-serif');
    await size.fill('18');
    await color.fill('#123456');
    await expect(hex).toHaveValue('#123456');
    await hex.fill('#12345680');
    await hex.press('Enter');
    if (kind === 'text' || kind === 'shape' || kind === 'table') {
      for (const name of ['Полужирный', 'Курсив']) {
        const button = toolbar.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
      }
      await toolbar.getByRole('group', { name: 'Выравнивание текста', exact: true })
        .getByRole('button', { name: 'По правому краю', exact: true }).click();
    } else {
      await expect(toolbar.getByRole('button', { name: 'Полужирный', exact: true })).toHaveCount(0);
      await expect(toolbar.getByRole('button', { name: 'Курсив', exact: true })).toHaveCount(0);
    }
    const content = kind === 'shape' ? element.locator('.shape-text-presentation')
      : kind === 'table' ? element.locator('tbody textarea').first()
        : kind === 'selectField' ? element.locator('select')
          : element.getByRole('textbox');
    const expectTypography = async (): Promise<void> => {
      await expect(content).toHaveCSS('font-family', /MarkD PT Serif/);
      await expect(content).toHaveCSS('font-size', '18px');
      await expect(content).toHaveCSS('color', 'rgba(18, 52, 86, 0.5)');
      if (kind === 'text' || kind === 'shape' || kind === 'table') {
        await expect(content).toHaveCSS('font-weight', '700');
        await expect(content).toHaveCSS('font-style', 'italic');
        await expect(content).toHaveCSS('text-align', 'right');
      }
    };
    await expectTypography();
    await saveFileFromMenu();
    await expect.poll(() => existsSync(projectPath)).toBe(true);
    const savedProject = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
    expect(savedProject.pages[0].elements.find((candidate) => candidate.type === kind)).toMatchObject(
      kind === 'shape' ? { textStyle: { color: '#12345680' } }
        : { style: { [kind === 'text' ? 'color' : 'textColor']: '#12345680' } }
    );
    await window.getByRole('button', { name: 'К проектам' }).click();
    await window.getByRole('button', { name: 'Открыть проект markd-e2e-proposal' }).click();
    await expectTypography();
    expect(runtimeErrors).toEqual([]);
  });
}

test('opens a copied self-contained project on a clean profile', async () => {
  test.setTimeout(60_000);
  await window.getByTestId('text-element').first().getByRole('textbox', { name: 'Текст на странице' }).click();
  await elementToolbar().getByLabel('Шрифт').selectOption('pt-serif');
  await addElement(/^Изображение/);
  await expect(window.getByTestId('image-element')).toHaveCount(1);

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  copyFileSync(projectPath, transferredProjectPath);
  unlinkSync(projectPath);
  await electronApp.close();

  electronApp = await electron.launch({
    args: ['.', transferredProjectPath],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MARKD_USER_DATA_DIR: transferredUserDataPath,
      MARKD_E2E_HEADLESS: hiddenTestWindow ? '1' : '0'
    }
  });
  window = await electronApp.firstWindow();
  await expect(window.locator('.app-shell')).toBeVisible({ timeout: 15_000 });
  await expect(window.getByText(/Открыт markd-e2e-transferred.markd/)).toBeVisible();
  await expect(window.getByTestId('image-element').locator('img')).toBeVisible();
  await expect.poll(() => window.getByTestId('text-element').first().evaluate(async (node) => {
    await document.fonts.ready;
    return getComputedStyle(node.querySelector('.document-text')!).fontFamily;
  })).toContain('MarkD PT Serif');

  const transferred = JSON.parse(readFileSync(transferredProjectPath, 'utf8')) as {
    assets: Array<{ dataUrl: string }>;
    pages: Array<{ elements: Array<{ type: string; style?: { fontId?: string } }> }>;
  };
  expect(transferred.assets[0].dataUrl).toMatch(/^data:image\/(jpeg|png|webp);base64,/);
  expect(transferred.pages[0].elements.find((element) => element.type === 'text')?.style?.fontId).toBe('pt-serif');
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
  await tableInputs.nth(0).dblclick();
  await tableInputs.nth(0).fill('Организация мероприятия');
  await tableInputs.nth(1).dblclick();
  await tableInputs.nth(1).fill('1');
  await tableInputs.nth(2).dblclick();
  await tableInputs.nth(2).fill('120 000 ₽');

  await addElement(/^Изображение/);
  await expect(window.getByTestId('image-element')).toHaveCount(1);
  await expect(window.getByTestId('image-element').locator('img')).toBeVisible();

  const imageBox = await window.getByTestId('image-element').boundingBox();
  const tableBox = await window.getByTestId('table-element').boundingBox();
  expect(imageBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  const overlapsTable =
    imageBox!.x < tableBox!.x + tableBox!.width &&
    imageBox!.x + imageBox!.width > tableBox!.x &&
    imageBox!.y < tableBox!.y + tableBox!.height &&
    imageBox!.y + imageBox!.height > tableBox!.y;
  expect(overlapsTable).toBe(false);

  await window.getByTestId('table-element').click({ position: { x: 2, y: 2 } });
  await expect(window.getByRole('heading', { name: 'Таблица' })).toBeVisible();
  await expectNoGeometryControls();
  const beforeMove = await positionOnPage(window.getByTestId('table-element'));
  await dragBy(window.getByTestId('table-element').getByTestId('table-drag-handle'), 0, 30);
  expect((await positionOnPage(window.getByTestId('table-element'))).y).toBeGreaterThan(beforeMove.y + 15);

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  await expect(window.getByText(/Сохранено:/)).toBeVisible();

  const savedProject = JSON.parse(readFileSync(projectPath, 'utf8')) as { pages: unknown[]; assets: unknown[] };
  expect(savedProject.pages).toHaveLength(1);
  expect(savedProject.assets).toHaveLength(1);

  await window.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect.poll(() => existsSync(pdfPath)).toBe(true);
  await expect.poll(() => statSync(pdfPath).size).toBeGreaterThan(1_000);
  await expect(window.getByText(/PDF готов:/)).toBeVisible();
  expect(pdfPageCount(pdfPath)).toBe(savedProject.pages.length);

  await window.screenshot({ path: screenshotPaths.editor, fullPage: false });
  expect(runtimeErrors).toEqual([]);
});

test('moves a text block and restores its position with Undo', async () => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
  const textElement = window.getByTestId('text-element').first();
  const before = await positionOnPage(textElement);

  await expect(textElement.getByTestId('text-drag-handle')).toHaveCount(0);
  await textElement.getByRole('textbox', { name: 'Текст на странице' }).click();
  await expect(textElement.getByTestId('text-drag-handle')).toBeVisible();
  await dragBy(textElement.getByTestId('text-drag-handle'), 56, 34);
  const after = await positionOnPage(textElement);
  expect(after.x - before.x).toBeGreaterThan(40);
  expect(after.y - before.y).toBeGreaterThan(20);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await positionOnPage(textElement)).x).toBeCloseTo(before.x, 0);
  await expect.poll(async () => (await positionOnPage(textElement)).y).toBeCloseTo(before.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('copies and pastes text between text blocks', async () => {
  const textElements = window.getByTestId('text-element');
  const source = textElements.first().getByRole('textbox', { name: 'Текст на странице' });
  await source.fill('Текст для копирования');
  await source.press('ControlOrMeta+A');
  await source.press('ControlOrMeta+C');

  await addElement(/^Текст Свободный/);
  const target = textElements.last().getByRole('textbox', { name: 'Текст на странице' });
  await target.click();
  await target.press('ControlOrMeta+A');
  await target.press('ControlOrMeta+V');

  await expect(target).toHaveValue('Текст для копирования');
  expect(runtimeErrors).toEqual([]);
});

test('adds line breaks to text fields only with Shift+Enter', async () => {
  await addElement(/^Текстовое поле/);
  const canvasValue = window.getByTestId('text-field-element').getByRole('textbox');
  await expect(elementToolbar().getByRole('textbox', { name: 'Значение' })).toHaveCount(0);
  await canvasValue.fill('Первая строка');
  await canvasValue.press('Shift+Enter');
  await canvasValue.type('Вторая строка');
  await expect(canvasValue).toHaveValue('Первая строка\nВторая строка');
  await canvasValue.press('Enter');
  await expect(canvasValue).toHaveValue('Первая строка\nВторая строка');
  await canvasValue.press('Shift+Enter');
  await canvasValue.type('Третья строка');
  await expect(canvasValue).toHaveValue('Первая строка\nВторая строка\nТретья строка');
  await window.getByRole('button', { name: 'Открыть предпросмотр' }).click();
  await expect(window.getByTestId('text-field-element').locator('.field-presentation'))
    .toHaveText('Первая строка\nВторая строка\nТретья строка');
  expect(runtimeErrors).toEqual([]);
});

test('registers native clipboard shortcuts in the application menu', async () => {
  const menuRoles = await electronApp.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items.flatMap((item) =>
      item.submenu?.items.map((submenuItem) => submenuItem.role).filter(Boolean) ?? []
    ) ?? []
  );

  expect(menuRoles).toEqual(expect.arrayContaining(['cut', 'copy', 'paste', 'selectall']));
});

test('adds a dropped photo at the drop point', async () => {
  const page = window.getByTestId('editor-page').first().locator('.page');
  const pageBox = await page.boundingBox();
  expect(pageBox).not.toBeNull();
  const dataTransfer = await window.evaluateHandle(() => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mP8z8AARMAgYAAABQABJzQnCgAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'dropped-photo.png', { type: 'image/png' }));
    return transfer;
  });
  const clientX = pageBox!.x + pageBox!.width * 0.7;
  const clientY = pageBox!.y + pageBox!.height * 0.4;

  await page.dispatchEvent('dragenter', { dataTransfer, clientX, clientY });
  await expect(page.getByText('Отпустите, чтобы добавить фото')).toBeVisible();
  await page.dispatchEvent('dragover', { dataTransfer, clientX, clientY });
  await page.dispatchEvent('drop', { dataTransfer, clientX, clientY });

  const droppedImage = window.getByTestId('image-element');
  await expect(droppedImage).toHaveCount(1);
  await expect(droppedImage.locator('img')).toBeVisible();
  const imageBox = await droppedImage.boundingBox();
  expect(imageBox).not.toBeNull();
  expect(Math.abs(imageBox!.x + imageBox!.width / 2 - clientX)).toBeLessThan(3);
  expect(Math.abs(imageBox!.y + imageBox!.height / 2 - clientY)).toBeLessThan(3);
  await expect(page.getByText('Отпустите, чтобы добавить фото')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('adds and styles a basic shape', async () => {
  await addElement(/^Прямоугольник/);
  const shape = window.getByTestId('shape-element');
  await expect(shape).toHaveCount(1);
  await expect(window.getByRole('heading', { name: 'Фигура' })).toBeVisible();

  await openInspectorSection('Форма');
  await elementToolbar().getByLabel('Тип фигуры').selectOption('triangle');
  await openInspectorSection('Контур');
  await elementToolbar().getByLabel('Стиль').selectOption('dashed');
  await elementToolbar().getByLabel('Толщина, px').fill('3');
  await expect(shape.locator('polygon')).toHaveCount(1);
  await expect.poll(() => shape.locator('polygon').evaluate((node) => getComputedStyle(node).strokeDasharray)).toContain('10');
  expect(runtimeErrors).toEqual([]);
});

test('opens one shape property popover at a time with keyboard dismissal', async () => {
  await addElement(/^Прямоугольник/);

  const form = elementToolbar().getByRole('button', { name: 'Форма', exact: true });
  const fill = elementToolbar().getByRole('button', { name: 'Заливка', exact: true });
  const stroke = elementToolbar().getByRole('button', { name: 'Контур', exact: true });
  const text = elementToolbar().getByRole('button', { name: 'Текст', exact: true });
  const position = elementToolbar().getByRole('button', { name: 'Положение', exact: true });

  await expect(form).toHaveAttribute('aria-expanded', 'false');
  await expect(fill).toHaveAttribute('aria-expanded', 'false');
  await expect(stroke).toHaveAttribute('aria-expanded', 'false');
  await expect(text).toHaveCount(0);
  await expect(position).toHaveCount(0);
  await expectNoGeometryControls();
  await expect(window.getByText('КОМПОНЕНТ', { exact: true })).toHaveCount(0);
  await elementToolbar().screenshot({ path: shapePanelScreenshotPath });

  await stroke.focus();
  await stroke.press('Enter');
  await expect(stroke).toBeFocused();
  await expect(stroke).toHaveAttribute('aria-expanded', 'true');
  await expect(stroke).toHaveCSS('outline-style', 'solid');
  await expect(elementToolbar().getByLabel('Толщина, px')).toBeVisible();

  await form.focus();
  await form.press('Space');
  await expect(stroke).toHaveAttribute('aria-expanded', 'false');
  await expect(elementToolbar().locator('.inspector-section-content:visible')).toHaveCount(1);
  const content = elementToolbar().getByLabel('Скругление, px');
  await content.fill('16');
  await form.click();
  await expect(content).toBeHidden();
  await form.click();
  await expect(content).toHaveValue('16');
  await content.press('Escape');
  await expect(form).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toBeFocused();
  await openInspectorSection('Форма');
  await window.getByText('MARKD', { exact: true }).click();
  await expect(form).toHaveAttribute('aria-expanded', 'false');
  await expect(content).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test('rounds a rectangle and edits its centered text on double click', async () => {
  await addElement(/^Прямоугольник/);
  const shape = window.getByTestId('shape-element');

  await openInspectorSection('Форма');
  await elementToolbar().getByLabel('Скругление, px').fill('18');
  await elementToolbar().getByLabel('Шрифт').selectOption('pt-serif');
  await elementToolbar().getByLabel('Размер, px').fill('20');
  await shape.dblclick();

  const editor = shape.getByRole('textbox', { name: 'Текст фигуры' });
  await expect(editor).toBeFocused();
  await editor.fill('Условия предложения');
  await editor.press('Escape');

  await expect(shape.locator('rect')).toHaveAttribute('rx', /^(?!0(?:\.0+)?$).+/);
  await expect(shape.locator('.shape-text-presentation')).toHaveText('Условия предложения');
  await expect(shape.locator('.shape-text-presentation')).toHaveCSS('font-family', /MarkD PT Serif/);
  await expect(shape.locator('.shape-text-presentation')).toHaveCSS('text-align', 'center');

  await expect(shape.getByRole('button', { name: 'Редактировать текст фигуры' })).toHaveCount(0);
  await shape.focus();
  await shape.press('Enter');
  await expect(shape.getByRole('textbox', { name: 'Текст фигуры' })).toBeFocused();
  await shape.getByRole('textbox', { name: 'Текст фигуры' }).press('Escape');
  expect(runtimeErrors).toEqual([]);
});

test('keeps selection chrome above an overlapping element with a higher stack position', async () => {
  const textElement = window.getByTestId('text-element').first();
  await addElement(/^Прямоугольник/);
  const shapeElement = window.getByTestId('shape-element');
  await openGeometryFixture((project) => {
    const text = project.pages[0].elements.find((element) => element.type === 'text')!;
    const shape = project.pages[0].elements.find((element) => element.type === 'shape')!;
    shape.rect = { x: text.rect.x + text.rect.width - 5, y: text.rect.y, width: 30, height: text.rect.height };
  });

  const [textBox, shapeBox] = await Promise.all([textElement.boundingBox(), shapeElement.boundingBox()]);
  expect(textBox).not.toBeNull();
  expect(shapeBox).not.toBeNull();
  expect(shapeBox!.x).toBeLessThan(textBox!.x + textBox!.width);
  expect(shapeBox!.y).toBeLessThan(textBox!.y + textBox!.height);

  await textElement.getByRole('textbox', { name: 'Текст на странице' }).click({ position: { x: 2, y: 2 } });
  const textContent = textElement.locator('.canvas-element-content');
  const shapeContent = shapeElement.locator('.canvas-element-content');
  await expect(textElement).toHaveCSS('z-index', 'auto');
  await expect.poll(async () => Number(await shapeContent.evaluate((node) => getComputedStyle(node).zIndex)))
    .toBeGreaterThan(Number(await textContent.evaluate((node) => getComputedStyle(node).zIndex)));
  await expect.poll(async () => Number(await textElement.getByTestId('editor-overlay').evaluate((node) => getComputedStyle(node).zIndex)))
    .toBeGreaterThan(Number(await shapeContent.evaluate((node) => getComputedStyle(node).zIndex)));
  await expect(textElement.getByRole('button', { name: 'Переместить текстовый блок' })).toBeVisible();
  await expect(textElement.getByRole('button', { name: 'Изменить размер текстового блока' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('moves a table and restores its position with Undo', async () => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
  const tableElement = window.getByTestId('table-element').first();
  const before = await positionOnPage(tableElement);

  await expect(tableElement.getByTestId('table-drag-handle')).toHaveCount(0);
  await tableElement.locator('.document-table-header').click({ position: { x: 40, y: 10 } });
  await expect(tableElement.getByTestId('table-drag-handle')).toBeVisible();
  await dragBy(tableElement.getByTestId('table-drag-handle'), 48, 28);
  const after = await positionOnPage(tableElement);
  expect(after.x - before.x).toBeGreaterThan(32);
  expect(after.y - before.y).toBeGreaterThan(16);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await positionOnPage(tableElement)).x).toBeCloseTo(before.x, 0);
  await expect.poll(async () => (await positionOnPage(tableElement)).y).toBeCloseTo(before.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('resizes a table like other canvas components and restores it with Undo', async () => {
  const tableElement = window.getByTestId('table-element').first();
  await tableElement.locator('.document-table-header').click({ position: { x: 40, y: 10 } });
  const resizeHandle = tableElement.getByRole('button', { name: 'Изменить размер таблицы' });
  await expect(resizeHandle).toBeVisible();
  const before = await tableElement.boundingBox();
  expect(before).not.toBeNull();

  await dragBy(resizeHandle, 30, 24);

  const after = await tableElement.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 15);
  expect(after!.height).toBeGreaterThan(before!.height + 10);
  await expectNoGeometryControls();

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await tableElement.boundingBox())?.width).toBeCloseTo(before!.width, 0);
  await expect.poll(async () => (await tableElement.boundingBox())?.height).toBeCloseTo(before!.height, 0);
  expect(runtimeErrors).toEqual([]);
});

test('resizes table columns, rows and header with cursor and keyboard', async () => {
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click({ position: { x: 40, y: 10 } });
  const firstCell = table.locator('thead th').first();
  const secondCell = table.locator('thead th').nth(1);
  const firstBefore = await firstCell.boundingBox();
  const secondBefore = await secondCell.boundingBox();
  const tableBefore = await table.boundingBox();
  expect(firstBefore).not.toBeNull();
  expect(secondBefore).not.toBeNull();
  expect(tableBefore).not.toBeNull();

  await dragBy(table.getByTestId('table-column-resize-1'), 28, 0);
  const firstAfter = await firstCell.boundingBox();
  const secondAfter = await secondCell.boundingBox();
  expect(firstAfter!.width).toBeGreaterThan(firstBefore!.width + 15);
  expect(secondAfter!.width).toBeLessThan(secondBefore!.width - 15);
  await expect.poll(async () => (await table.boundingBox())?.width).toBeCloseTo(tableBefore!.width, 0);

  const headerResize = table.getByTestId('table-header-row-resize');
  const headerBefore = await table.locator('thead tr').boundingBox();
  await dragBy(headerResize, 0, 18);
  const headerAfterPointer = await table.locator('thead tr').boundingBox();
  expect(headerAfterPointer!.height).toBeGreaterThan(headerBefore!.height + 10);

  await headerResize.focus();
  await headerResize.press('ArrowDown');
  await expect.poll(async () => (await table.locator('thead tr').boundingBox())?.height).toBeGreaterThan(headerAfterPointer!.height);

  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  const bodyRowBefore = await table.locator('tbody tr').first().boundingBox();
  await dragBy(table.getByTestId('table-row-resize-2'), 0, 16);
  const bodyRowAfter = await table.locator('tbody tr').first().boundingBox();
  expect(bodyRowAfter!.height).toBeGreaterThan(bodyRowBefore!.height + 8);
  expect(runtimeErrors).toEqual([]);
});

test('aligns table selections with Undo and save persistence', async () => {
  test.setTimeout(60_000);
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  const toolbar = elementToolbar();
  const horizontal = toolbar.getByRole('group', { name: 'Выравнивание текста', exact: true });
  const vertical = toolbar.getByRole('group', { name: 'Вертикальное выравнивание', exact: true });
  const applyHistory = async (action: 'Отменить' | 'Повторить', target: 'table' | 'column' | 'row'): Promise<void> => {
    await window.getByRole('button', { name: action }).click();
    await table.locator('.document-table-header').click();
    if (target === 'column') await table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }).click();
    if (target === 'row') await table.getByRole('button', { name: 'Выбрать строку 2', exact: true }).click();
  };
  const cell = (rowIndex: number, columnIndex: number): Locator =>
    table.locator('tr').nth(rowIndex).locator('th, td').nth(columnIndex);
  const expectCell = async (rowIndex: number, columnIndex: number, align: string, verticalAlign: string): Promise<void> => {
    await expect(cell(rowIndex, columnIndex).locator('textarea')).toHaveCSS('text-align', align);
    await expect(cell(rowIndex, columnIndex)).toHaveCSS('vertical-align', verticalAlign);
    await expect(cell(rowIndex, columnIndex).locator('.table-cell-content'))
      .toHaveCSS('justify-content', verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'middle' ? 'center' : 'flex-end');
  };
  for (const name of ['Область выравнивания', 'Столбец таблицы', 'Строка таблицы']) {
    await expect(toolbar.getByRole('combobox', { name, exact: true })).toHaveCount(0);
  }
  await expect(toolbar.getByRole('button', { name: 'Наследовать', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Содержание', exact: true })).toHaveCount(0);
  await expect(horizontal).toBeVisible();
  await expect(vertical).toBeVisible();
  await expect(toolbar.locator('.text-placement-control')).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Колонки', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Строки', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Выбрать всю таблицу', exact: true })).toHaveCount(0);
  await expect(table.getByRole('button', { name: 'Добавить колонку таблицы', exact: true })).toBeVisible();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(3);
  await openInspectorSection('Текст и ячейки');
  await toolbar.getByLabel('Высота выбранных строк, px').fill('60');
  await toolbar.getByRole('button', { name: 'Текст и ячейки', exact: true }).click();

  await table.getByRole('button', { name: 'Выбрать ячейку 1, 1', exact: true }).focus();
  await window.keyboard.press('Escape');
  await horizontal.getByRole('button', { name: 'По правому краю', exact: true }).click();
  await vertical.getByRole('button', { name: 'По нижнему краю', exact: true }).click();
  for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
      await expectCell(rowIndex, columnIndex, 'right', 'bottom');
    }
  }

  await table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }).click();
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(3);
  await horizontal.getByRole('button', { name: 'По центру', exact: true }).click();
  await expectCell(0, 1, 'center', 'bottom');
  await expectCell(0, 0, 'right', 'bottom');
  await applyHistory('Отменить', 'column');
  await expectCell(0, 1, 'right', 'bottom');
  await applyHistory('Повторить', 'column');
  await expectCell(0, 1, 'center', 'bottom');
  await vertical.getByRole('button', { name: 'По середине', exact: true }).click();
  for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
    await expectCell(rowIndex, 1, 'center', 'middle');
    await expectCell(rowIndex, 0, 'right', 'bottom');
    await expectCell(rowIndex, 2, 'right', 'bottom');
  }
  await applyHistory('Отменить', 'column');
  await expectCell(2, 1, 'center', 'bottom');
  await applyHistory('Повторить', 'column');
  await expectCell(2, 1, 'center', 'middle');

  await table.getByRole('button', { name: 'Выбрать строку 2', exact: true }).click();
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(3);
  await horizontal.getByRole('button', { name: 'По левому краю', exact: true }).click();
  await expectCell(1, 1, 'left', 'middle');
  await applyHistory('Отменить', 'row');
  await expectCell(1, 1, 'center', 'middle');
  await applyHistory('Повторить', 'row');
  await vertical.getByRole('button', { name: 'По верхнему краю', exact: true }).click();
  await expectCell(1, 1, 'left', 'top');
  await applyHistory('Отменить', 'row');
  await expectCell(1, 1, 'left', 'middle');
  await expectCell(1, 0, 'left', 'bottom');
  await applyHistory('Повторить', 'row');

  await table.getByRole('button', { name: 'Выбрать ячейку 1, 1', exact: true }).focus();
  await window.keyboard.press('Escape');
  await horizontal.getByRole('button', { name: 'По левому краю', exact: true }).click();
  await expectCell(2, 0, 'left', 'bottom');
  await expectCell(2, 1, 'left', 'middle');
  await expectCell(1, 1, 'left', 'top');
  await applyHistory('Отменить', 'table');
  await expectCell(2, 0, 'right', 'bottom');

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = projectSchema.parse(JSON.parse(readFileSync(projectPath, 'utf8')));
  const savedTable = saved.pages[0].elements.find((element) => element.type === 'table');
  if (!savedTable) throw new Error('Saved table is missing');
  await table.getByRole('button', { name: 'Выбрать столбец 2', exact: true }).click();
  await expect(cell(0, 1)).toHaveAttribute('data-table-column', savedTable.columns[1]);
  await table.getByRole('button', { name: 'Выбрать строку 2', exact: true }).click();
  await expect(cell(1, 0)).toHaveAttribute('data-table-row', savedTable.rows[1].id);

  await window.getByRole('button', { name: 'К проектам' }).click();
  await window.getByRole('button', { name: 'Открыть проект markd-e2e-proposal' }).click();
  await table.locator('.document-table-header').click();
  for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
      await expectCell(rowIndex, columnIndex, rowIndex === 1 ? 'left' : columnIndex === 1 ? 'center' : 'right',
        rowIndex === 1 ? 'top' : columnIndex === 1 ? 'middle' : 'bottom');
    }
  }
  await cell(2, 2).locator('textarea').dblclick();
  await expect(table.locator('[data-cell-selected="true"]')).toHaveCount(1);
  await expect(cell(2, 2)).toHaveAttribute('data-table-column', savedTable.columns[2]);
  expect(runtimeErrors).toEqual([]);
});

test('moves an image like other canvas components and restores it with Undo', async () => {
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
  await addElement(/^Изображение/);
  const imageElement = window.getByTestId('image-element');
  const before = await positionOnPage(imageElement);

  await expect(imageElement.getByTestId('image-drag-handle')).toHaveCount(0);
  await imageElement.locator('img').click();
  const dragHandle = imageElement.getByTestId('image-drag-handle');
  await expect(dragHandle).toBeVisible();
  await expect(imageElement.getByRole('button', { name: 'Изменить размер изображения' })).toBeVisible();

  await dragBy(dragHandle, 52, 30);
  const after = await positionOnPage(imageElement);
  expect(after.x - before.x).toBeGreaterThan(36);
  expect(after.y - before.y).toBeGreaterThan(18);

  await window.getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(async () => (await positionOnPage(imageElement)).x).toBeCloseTo(before.x, 0);
  await expect.poll(async () => (await positionOnPage(imageElement)).y).toBeCloseTo(before.y, 0);
  expect(runtimeErrors).toEqual([]);
});

test('keeps the full image and white transparent background after saving and reopening', async () => {
  await addElement(/^Изображение/);
  const imageElement = window.getByTestId('image-element');
  const page = window.getByTestId('editor-page').first().locator('.page');
  await imageElement.locator('img').click();
  await expect(page).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(imageElement).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(imageElement.locator('img')).toHaveCSS('object-fit', 'contain');

  await elementToolbar().getByRole('button', { name: 'На весь лист' }).click();
  await expectNoGeometryControls();
  await expectFullPageImage(imageElement);

  const moveHandle = imageElement.getByRole('button', { name: 'Переместить изображение' });
  const resizeHandle = imageElement.getByRole('button', { name: 'Изменить размер изображения' });
  await expect(moveHandle).toBeVisible();
  await expect(resizeHandle).toBeVisible();

  const [pageBox, renderedImageBox, moveBox, resizeBox] = await Promise.all([
    page.boundingBox(),
    imageElement.locator('img').boundingBox(),
    moveHandle.boundingBox(),
    resizeHandle.boundingBox()
  ]);
  expect(pageBox).not.toBeNull();
  expect(renderedImageBox).not.toBeNull();
  expect(moveBox).not.toBeNull();
  expect(resizeBox).not.toBeNull();
  expect(renderedImageBox!.x).toBeCloseTo(pageBox!.x, 1);
  expect(renderedImageBox!.y).toBeCloseTo(pageBox!.y, 1);
  expect(renderedImageBox!.width).toBeCloseTo(pageBox!.width, 1);
  expect(renderedImageBox!.height).toBeCloseTo(pageBox!.height, 1);
  expect(moveBox!.x).toBeGreaterThanOrEqual(pageBox!.x);
  expect(moveBox!.y).toBeGreaterThanOrEqual(pageBox!.y);
  expect(moveBox!.x + moveBox!.width).toBeLessThanOrEqual(pageBox!.x + pageBox!.width);
  expect(moveBox!.y + moveBox!.height).toBeLessThanOrEqual(pageBox!.y + pageBox!.height);
  expect(resizeBox!.x).toBeGreaterThanOrEqual(pageBox!.x);
  expect(resizeBox!.y).toBeGreaterThanOrEqual(pageBox!.y);
  expect(resizeBox!.x + resizeBox!.width).toBeLessThanOrEqual(pageBox!.x + pageBox!.width);
  expect(resizeBox!.y + resizeBox!.height).toBeLessThanOrEqual(pageBox!.y + pageBox!.height);
  await expect(imageElement.locator('img')).toHaveCSS('object-fit', 'fill');

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  await window.getByRole('button', { name: 'К проектам' }).click();
  await window.getByRole('button', { name: 'Открыть проект markd-e2e-proposal' }).click();

  const reopenedImage = window.getByTestId('image-element');
  await reopenedImage.locator('img').click();
  await expectNoGeometryControls();
  await expectFullPageImage(reopenedImage);
  await expect(window.getByTestId('editor-page').first().locator('.page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(reopenedImage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(reopenedImage.locator('img')).toHaveCSS('object-fit', 'fill');

  await window.emulateMedia({ media: 'print' });
  await expect(window.getByTestId('editor-page').first().locator('.page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(reopenedImage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(reopenedImage.locator('img')).toHaveCSS('object-fit', 'fill');
  expect(runtimeErrors).toEqual([]);
});

test('snaps image resizing to page edges and shows smart guides', async () => {
  await addElement(/^Изображение/);
  const imageElement = window.getByTestId('image-element');
  await openGeometryFixture((project) => {
    project.pages[0].elements.find((element) => element.type === 'image')!.rect =
      { x: 0, y: 0, width: 200, height: 287 };
  });
  await imageElement.locator('img').click();

  const page = window.getByTestId('editor-page').first().locator('.page');
  const resizeHandle = imageElement.getByRole('button', { name: 'Изменить размер изображения' });
  await resizeHandle.scrollIntoViewIfNeeded();
  const [pageBox, imageBox, handleBox] = await Promise.all([
    page.boundingBox(),
    imageElement.boundingBox(),
    resizeHandle.boundingBox()
  ]);
  expect(pageBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(handleBox).not.toBeNull();

  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;
  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(
    startX + pageBox!.x + pageBox!.width - imageBox!.x - imageBox!.width - 2,
    startY + pageBox!.y + pageBox!.height - imageBox!.y - imageBox!.height - 2,
    { steps: 6 }
  );
  await expect(page.getByTestId('snap-guide-vertical')).toBeVisible();
  await expect(page.getByTestId('snap-guide-horizontal')).toBeVisible();
  await window.mouse.up();

  await expectNoGeometryControls();
  await expectFullPageImage(imageElement);
  await expect(page.getByTestId('snap-guide-vertical')).toHaveCount(0);
  await expect(page.getByTestId('snap-guide-horizontal')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('snaps component centers to each other and shows smart guides', async () => {
  await addElement(/^Прямоугольник/);
  const shapes = window.getByTestId('shape-element');
  const target = shapes.first();
  await addElement(/^Прямоугольник/);
  const moving = shapes.last();
  await openGeometryFixture((project) => {
    const shapes = project.pages[0].elements.filter((element) => element.type === 'shape');
    shapes[0].rect = { x: 30, y: 50, width: 40, height: 20 };
    shapes[1].rect = { x: 100, y: 100, width: 10, height: 10 };
  });
  await moving.locator('.canvas-element-content').click();

  const moveHandle = moving.getByRole('button', { name: 'Переместить фигуру' });
  const page = window.getByTestId('editor-page').first().locator('.page');
  const [targetBox, movingBox, handleBox] = await Promise.all([
    target.boundingBox(),
    moving.boundingBox(),
    moveHandle.boundingBox()
  ]);
  expect(targetBox).not.toBeNull();
  expect(movingBox).not.toBeNull();
  expect(handleBox).not.toBeNull();

  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;
  const targetCenterX = targetBox!.x + targetBox!.width / 2;
  const targetCenterY = targetBox!.y + targetBox!.height / 2;
  const movingCenterX = movingBox!.x + movingBox!.width / 2;
  const movingCenterY = movingBox!.y + movingBox!.height / 2;
  await window.mouse.move(startX, startY);
  await window.mouse.down();
  await window.mouse.move(
    startX + targetCenterX - movingCenterX + 2,
    startY + targetCenterY - movingCenterY + 2,
    { steps: 6 }
  );

  await expect(page.getByTestId('snap-guide-vertical')).toBeVisible();
  await expect(page.getByTestId('snap-guide-horizontal')).toBeVisible();
  await window.mouse.up();

  const alignedBox = await moving.boundingBox();
  expect(alignedBox).not.toBeNull();
  expect(alignedBox!.x + alignedBox!.width / 2).toBeCloseTo(targetCenterX, 1);
  expect(alignedBox!.y + alignedBox!.height / 2).toBeCloseTo(targetCenterY, 1);
  await expect(page.getByTestId('snap-guide-vertical')).toHaveCount(0);
  await expect(page.getByTestId('snap-guide-horizontal')).toHaveCount(0);
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
  await expect(layeredText.getByRole('textbox', { name: 'Текст на странице' })).toHaveValue('Текст второго слоя');
  await expect(window.getByRole('button', { name: /^Основной \d+$/ })).toHaveAttribute('aria-pressed', 'true');

  await layeredText.getByRole('textbox', { name: 'Текст на странице' }).click();
  await expect(window.getByRole('button', { name: /^Изображения \d+$/ })).toHaveAttribute('aria-pressed', 'true');
  await layeredText.getByRole('textbox', { name: 'Текст на странице' }).click();
  const textColor = elementToolbar().getByLabel('Цвет текста: выбор цвета', { exact: true });
  await textColor.fill('#123456');
  await expect.poll(() => layeredText.getByRole('textbox').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(18, 52, 86)');

  await window.getByRole('button', { name: /^Основной \d+$/ }).click();
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await expect(elementToolbar().getByRole('button', { name: 'Выбрать всю таблицу', exact: true })).toHaveCount(0);
  await table.getByRole('button', { name: 'Выбрать ячейку 1, 1', exact: true }).focus();
  await window.keyboard.press('Escape');
  await elementToolbar().getByRole('group', { name: 'Выравнивание текста', exact: true }).getByRole('button', { name: 'По правому краю', exact: true }).click();
  await expect.poll(() => table.locator('textarea').first().evaluate((node) => getComputedStyle(node).textAlign)).toBe('right');

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    layers: unknown[];
    pages: Array<{ elements: Array<{ type: string; layerId: string; style?: { color?: string; align?: string } }> }>;
  };
  expect(saved.layers).toHaveLength(2);
  expect(saved.pages[0].elements.find((element) => element.type === 'text' && element.style?.color === '#123456')).toBeTruthy();
  const savedTable = saved.pages[0].elements.find((element) => element.type === 'table');
  expect(savedTable?.style?.align).toBe('right');
  expect(runtimeErrors).toEqual([]);
});

test('lists layer elements and exposes stacking actions', async () => {
  const layersPanel = window.getByRole('region', { name: 'Слои и элементы' });
  const mainLayerToggle = layersPanel.getByRole('button', { name: 'Раскрыть Основной' });
  await expect(mainLayerToggle).toHaveAttribute('aria-expanded', 'false');
  await mainLayerToggle.click();
  const textItem = layersPanel.getByRole('button', { name: 'Текст: Коммерческое предложение' });
  const tableItem = layersPanel.getByRole('button', { name: 'Таблица: Позиции' });
  await expect(textItem).toBeVisible();
  await expect(tableItem).toBeVisible();

  await tableItem.focus();
  await expect(tableItem).toBeFocused();
  await window.keyboard.press('Enter');
  await expect(tableItem).toHaveAttribute('aria-pressed', 'true');
  await expect(window.getByRole('heading', { name: 'Таблица' })).toBeVisible();
  const bringToFront = layersPanel.getByRole('button', { name: 'На передний план' });
  const sendToBack = layersPanel.getByRole('button', { name: 'На задний план' });
  const deleteElement = layersPanel.getByRole('button', { name: 'Удалить', exact: true });
  const selectedElementRow = tableItem.locator('..');
  await expect(bringToFront).toBeVisible();
  await expect(sendToBack).toBeVisible();
  await expect(deleteElement).toBeVisible();
  await expect(selectedElementRow).toHaveCSS('background-color', 'rgb(220, 233, 227)');
  await expect(tableItem).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(tableItem).toHaveCSS('outline-style', 'none');
  await expect(selectedElementRow).toHaveCSS('box-shadow', 'rgb(30, 91, 73) 0px 0px 0px 2px inset');
  const selectedItemBounds = await tableItem.boundingBox();
  const actionBounds = await bringToFront.locator('..').boundingBox();
  expect(selectedItemBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(actionBounds!.x).toBeGreaterThan(selectedItemBounds!.x);
  expect(Math.abs(actionBounds!.y - selectedItemBounds!.y)).toBeLessThan(8);

  const canvasText = window.getByTestId('text-element').first();
  const canvasTable = window.getByTestId('table-element').first();
  const canvasTextContent = canvasText.locator('.canvas-element-content');
  const canvasTableContent = canvasTable.locator('.canvas-element-content');
  await bringToFront.click();
  await expect.poll(async () => Number(await canvasTableContent.evaluate((node) => getComputedStyle(node).zIndex)))
    .toBeGreaterThan(Number(await canvasTextContent.evaluate((node) => getComputedStyle(node).zIndex)));

  await sendToBack.click();
  await expect.poll(async () => Number(await canvasTableContent.evaluate((node) => getComputedStyle(node).zIndex)))
    .toBeLessThan(Number(await canvasTextContent.evaluate((node) => getComputedStyle(node).zIndex)));

  await deleteElement.click();
  await expect(canvasTable).toHaveCount(0);
  await expect(tableItem).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('keeps toolbar popovers and document structure independently scrollable', async () => {
  await window.setViewportSize({ width: 1100, height: 560 });
  const structure = window.getByRole('complementary', { name: 'Структура документа' });
  const toolbar = elementToolbar();
  const layersPanel = structure.getByRole('region', { name: 'Слои и элементы' });
  const layersPane = structure.locator('.inspector-layers-pane');
  const canvasPane = window.getByRole('region', { name: 'Рабочая область документа' });
  await expect(toolbar).toHaveAttribute('aria-label', 'Панель инструментов элемента');
  await expect(structure.locator('.inspector-panel')).toHaveCount(0);
  await expect(structure.getByRole('separator', { name: 'Изменить высоту панелей' })).toHaveCount(0);
  await expect(layersPane).toHaveCSS('overflow-y', 'auto');
  await expect(layersPane).toHaveCSS('scrollbar-width', 'thin');

  const mainLayerToggle = layersPanel.getByRole('button', { name: 'Раскрыть Основной' });
  const textItem = layersPanel.getByRole('button', { name: 'Текст: Коммерческое предложение' });
  await expect(mainLayerToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(textItem).toHaveCount(0);
  await layersPanel.getByRole('button', { name: /^Основной \d+$/ }).click();
  await expect(mainLayerToggle).toHaveAttribute('aria-expanded', 'false');
  await mainLayerToggle.focus();
  await mainLayerToggle.press('Enter');
  await expect(textItem).toBeVisible();

  await structure.getByRole('button', { name: 'Добавить слой' }).click();
  await expect(layersPanel.getByRole('button', { name: 'Раскрыть Слой 2' })).toHaveAttribute('aria-expanded', 'false');
  await expect(mainLayerToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(textItem).toHaveCount(0);
  for (let index = 0; index < 12; index += 1) {
    await structure.getByRole('button', { name: 'Добавить слой' }).click();
  }

  await window.setViewportSize({ width: 1100, height: 420 });
  await window.getByTestId('table-element').first().locator('.document-table-header').click();
  await openInspectorSection('Текст и ячейки');
  await toolbar.getByRole('checkbox', { name: 'Чередовать цвет строк' }).check();
  const colors = await openInspectorSection('Цвета');
  const propertiesPane = toolbar.locator('.inspector-section-content:visible');
  await expect(propertiesPane).toHaveCount(1);
  await expect(propertiesPane).toHaveCSS('overflow-y', 'auto');
  const [toolbarBounds, canvasBounds, structureBounds] = await Promise.all([
    toolbar.boundingBox(), canvasPane.boundingBox(), structure.boundingBox()
  ]);
  expect(toolbarBounds).not.toBeNull();
  expect(canvasBounds).not.toBeNull();
  expect(structureBounds).not.toBeNull();
  expect(toolbarBounds!.y + toolbarBounds!.height).toBeLessThanOrEqual(canvasBounds!.y + 1);
  expect(canvasBounds!.x + canvasBounds!.width).toBeLessThanOrEqual(structureBounds!.x + 1);

  const layersScroll = await layersPane.evaluate((node) => {
    node.scrollTop = 120;
    return { top: node.scrollTop, height: node.scrollHeight, viewport: node.clientHeight };
  });
  expect(layersScroll.height).toBeGreaterThan(layersScroll.viewport);
  expect(layersScroll.top).toBeGreaterThan(0);
  expect(await propertiesPane.evaluate((node) => node.scrollTop)).toBe(0);
  const propertiesScroll = await propertiesPane.evaluate((node) => {
    node.scrollTop = 120;
    return { top: node.scrollTop, height: node.scrollHeight, viewport: node.clientHeight };
  });
  expect(propertiesScroll.height).toBeGreaterThan(propertiesScroll.viewport);
  expect(propertiesScroll.top).toBeGreaterThan(0);
  expect(await layersPane.evaluate((node) => node.scrollTop)).toBe(layersScroll.top);

  await propertiesPane.getByRole('textbox').first().focus();
  await window.keyboard.press('Escape');
  await expect(colors).toHaveAttribute('aria-expanded', 'false');
  await expect(colors).toBeFocused();
  await canvasPane.hover({ position: { x: 12, y: 12 } });
  await expect(canvasPane).toHaveCSS('scrollbar-color', 'rgba(67, 72, 65, 0.28) rgba(0, 0, 0, 0)');
  await structure.hover({ position: { x: 20, y: 20 } });
  await expect(canvasPane).toHaveCSS('scrollbar-color', 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)');

  await window.getByRole('button', { name: 'Структура', exact: true }).click();
  await expect(structure).toBeHidden();
  await expect(toolbar).toBeVisible();
  await window.getByRole('button', { name: 'Структура', exact: true }).click();
  await expect(structure).toBeVisible();
  await window.setViewportSize({ width: 1100, height: 360 });
  await expect(toolbar).toBeVisible();
  await expect(structure.getByRole('heading', { name: 'Структура' })).toBeVisible();
  await expect(window.getByRole('separator', { name: 'Изменить ширину правой панели' })).toBeVisible();

  await window.setViewportSize({ width: 700, height: 560 });
  await expect(structure).toBeHidden();
  await expect(toolbar).toHaveCSS('overflow-x', 'visible');
  await window.getByRole('button', { name: 'Структура', exact: true }).click();
  await expect(structure).toBeVisible();
  const narrowLayersScroll = await layersPane.evaluate((node) => {
    node.scrollTop = 100;
    return node.scrollTop;
  });
  expect(narrowLayersScroll).toBeGreaterThan(0);
  const canvasScroll = await canvasPane.evaluate((node) => node.scrollTop);
  const toolbarScroll = await toolbar.evaluate((node) => {
    node.scrollLeft = 120;
    return { left: node.scrollLeft, width: node.scrollWidth, viewport: node.clientWidth };
  });
  expect(toolbarScroll.width).toBeLessThanOrEqual(toolbarScroll.viewport);
  expect(toolbarScroll.left).toBe(0);
  expect(await layersPane.evaluate((node) => node.scrollTop)).toBe(narrowLayersScroll);
  expect(await canvasPane.evaluate((node) => node.scrollTop)).toBe(canvasScroll);
  await expect.poll(() => window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test('keeps layer visibility, locking, ordering, moving and deletion usable in the accordion', async () => {
  const layersPanel = window.getByRole('region', { name: 'Слои и элементы' });
  await window.getByRole('button', { name: 'Добавить слой' }).click();

  await layersPanel.getByRole('button', { name: /^Основной \d+$/ }).click();
  await layersPanel.getByRole('button', { name: 'Раскрыть Основной' }).click();
  const textItem = layersPanel.getByRole('button', { name: 'Текст: Коммерческое предложение' });
  await textItem.click();
  await layersPanel.getByRole('combobox', { name: 'Переместить элемент в слой' }).selectOption({ label: 'Переместить в: Слой 2' });

  await expect(layersPanel.getByRole('button', { name: 'Свернуть Слой 2' })).toHaveAttribute('aria-expanded', 'true');
  await expect(textItem).toBeVisible();

  await layersPanel.getByRole('button', { name: 'Скрыть Слой 2' }).click();
  await expect(layersPanel.getByRole('button', { name: /^Слой 2 \d+$/ })).toBeDisabled();
  await layersPanel.getByRole('button', { name: 'Раскрыть Слой 2' }).click();
  await layersPanel.getByRole('button', { name: 'Показать Слой 2' }).click();

  await layersPanel.getByRole('button', { name: 'Заблокировать Слой 2' }).click();
  await expect(layersPanel.getByRole('button', { name: /^Слой 2 \d+$/ })).toBeDisabled();
  await layersPanel.getByRole('button', { name: 'Разблокировать Слой 2' }).click();

  await layersPanel.getByRole('button', { name: 'Опустить Слой 2' }).click();
  await expect(layersPanel.getByRole('button', { name: 'Поднять Слой 2' })).toBeEnabled();
  await layersPanel.getByRole('button', { name: 'Поднять Слой 2' }).click();

  await layersPanel.getByRole('button', { name: 'Удалить Слой 2' }).click();
  await expect(layersPanel.getByRole('button', { name: /^Слой 2 \d+$/ })).toHaveCount(0);
  await layersPanel.getByRole('button', { name: 'Раскрыть Основной' }).click();
  await expect(layersPanel.getByRole('button', { name: 'Текст: Коммерческое предложение' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('activates a clicked element layer while protecting locked and hidden layers', async () => {
  const layers = window.getByRole('region', { name: 'Слои и элементы' });
  const mainLayer = layers.getByRole('button', { name: /^Основной \d+$/ });
  const otherLayer = layers.getByRole('button', { name: /^Слой 2 \d+$/ });
  await window.getByRole('button', { name: 'Добавить слой' }).click();
  await addElement(/^Прямоугольник/);
  const shape = window.getByTestId('shape-element');
  await dragBy(shape.getByRole('button', { name: 'Переместить фигуру' }), 0, 100);
  await window.keyboard.press('Escape');
  await mainLayer.click();
  await expect(mainLayer).toHaveAttribute('aria-pressed', 'true');
  await shape.locator('.canvas-element-content').click();
  await expect(otherLayer).toHaveAttribute('aria-pressed', 'true');
  await expect(shape.getByRole('button', { name: 'Переместить фигуру' })).toBeVisible();

  await mainLayer.click();
  await layers.getByRole('button', { name: 'Раскрыть Слой 2' }).click();
  await layers.getByRole('button', { name: 'Заблокировать Слой 2' }).click();
  await expect(otherLayer).toBeDisabled();
  const shapeBounds = await shape.boundingBox();
  expect(shapeBounds).not.toBeNull();
  const clickX = shapeBounds!.x + shapeBounds!.width / 2;
  const clickY = shapeBounds!.y + shapeBounds!.height / 2;
  await window.mouse.click(clickX, clickY);
  await expect(mainLayer).toHaveAttribute('aria-pressed', 'true');
  await expect(shape.getByRole('button', { name: 'Переместить фигуру' })).toHaveCount(0);
  await expect(shape.getByRole('textbox')).toHaveCount(0);

  await layers.getByRole('button', { name: 'Разблокировать Слой 2' }).click();
  await layers.getByRole('button', { name: 'Скрыть Слой 2' }).click();
  await expect(otherLayer).toBeDisabled();
  await expect(shape).toHaveCount(0);
  await window.mouse.click(clickX, clickY);
  await expect(mainLayer).toHaveAttribute('aria-pressed', 'true');
  await expect(shape).toHaveCount(0);
  await layers.getByRole('button', { name: 'Показать Слой 2' }).click();
  await shape.locator('.canvas-element-content').click();
  await expect(otherLayer).toHaveAttribute('aria-pressed', 'true');
  await expect(shape.getByRole('button', { name: 'Переместить фигуру' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('configures table title, header, rows and borders', async () => {
  const table = window.getByTestId('table-element').first();
  await table.locator('.document-table-header').click();
  await expect(window.getByRole('heading', { name: 'Таблица' })).toBeVisible();

  const heightBefore = (await table.boundingBox())?.height ?? 0;
  await openInspectorSection('Текст и ячейки');
  await elementToolbar().getByRole('checkbox', { name: 'Показывать заголовок блока' }).uncheck();
  await expect(table.locator('.document-table-header')).toHaveCount(0);
  await expect.poll(async () => (await table.boundingBox())?.height ?? 0).toBeLessThan(heightBefore);

  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await table.getByRole('button', { name: 'Добавить строку таблицы', exact: true }).click();
  await openInspectorSection('Текст и ячейки');
  await elementToolbar().getByRole('checkbox', { name: 'Чередовать цвет строк' }).check();
  await openInspectorSection('Цвета');
  await elementToolbar().getByLabel('Чётные строки: HEX').fill('#ddeeff');
  await elementToolbar().getByLabel('Чётные строки: HEX').press('Enter');
  await openInspectorSection('Текст и ячейки');
  await elementToolbar().getByLabel('Размер текста, px').fill('13');
  await elementToolbar().getByLabel('Высота выбранных строк, px').fill('46');
  await elementToolbar().getByLabel('Отступ ячейки, px').fill('10');
  await elementToolbar().getByRole('button', { name: 'Текст и ячейки', exact: true }).click();
  await expect(elementToolbar().getByRole('button', { name: 'Выбрать всю таблицу', exact: true })).toHaveCount(0);
  await table.getByRole('button', { name: 'Выбрать ячейку 1, 1', exact: true }).focus();
  await window.keyboard.press('Escape');
  await elementToolbar().getByRole('group', { name: 'Вертикальное выравнивание', exact: true }).getByRole('button', { name: 'По нижнему краю', exact: true }).click();
  await openInspectorSection('Границы');
  await elementToolbar().getByLabel('Толщина, px').fill('2');
  await elementToolbar().getByLabel('Стиль границы').selectOption('dashed');

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

  await saveFileFromMenu();
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
  await expect(window.locator('.editor-sidebar')).toBeHidden();
  await expect(window.locator('.page-meta').first()).toBeHidden();
  await expect(textElement.getByTestId('text-drag-handle')).toHaveCount(0);

  await window.getByRole('button', { name: 'Вернуться к редактированию' }).click();
  await expect(window.locator('.app-shell')).not.toHaveClass(/preview-mode/);
  await expect(window.locator('.editor-sidebar')).toBeVisible();
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

  await window.getByRole('button', { name: 'Файл', exact: true }).click();
  await window.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Архивное КП' })).toBeVisible();
  const legacyText = window.getByTestId('text-element').getByRole('textbox', { name: 'Текст на странице' });
  await expect(legacyText).toHaveValue('Документ из предыдущей версии');
  await expect.poll(() => legacyText.evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');

  await saveFileFromMenu();
  await expect.poll(() => existsSync(convertedLegacyProjectPath)).toBe(true);
  await expect.poll(() => (JSON.parse(readFileSync(convertedLegacyProjectPath, 'utf8')) as { schemaVersion: number }).schemaVersion).toBe(4);
  expect(runtimeErrors).toEqual([]);
});

test('edits fields, alignment, long content, clean preview, reopening and PDF', async () => {
  test.setTimeout(60_000);
  await window.setViewportSize({ width: 1440, height: 900 });
  await window.screenshot({ path: screenshotPaths.editor, fullPage: false });

  const inspector = window.locator('.editor-sidebar');
  const inspectorWidthBefore = (await inspector.boundingBox())?.width ?? 0;
  await dragBy(window.getByRole('separator', { name: 'Изменить ширину правой панели' }), -64, 0);
  await expect.poll(async () => (await inspector.boundingBox())?.width ?? 0).toBeGreaterThan(inspectorWidthBefore + 50);

  await addElement(/^Текстовое поле/);
  const textField = window.getByTestId('text-field-element');
  await expect(textField).toHaveCount(1);
  await expect(window.getByRole('heading', { name: 'Текстовое поле' })).toBeVisible();
  await textField.getByRole('textbox').fill('sales.department.with.a.very.long.address@example-company.test');
  await openInspectorSection('Поле');
  await elementToolbar().getByLabel('Подпись', { exact: true }).fill('Email клиента');
  await elementToolbar().getByLabel('Placeholder', { exact: true }).fill('name@example.com');
  await elementToolbar().getByRole('button', { name: /^Выбрано / }).click();
  await window.getByRole('dialog', { name: 'Выбор иконки' }).getByRole('button', { name: 'Почта', exact: true }).click();
  const iconPickerTrigger = elementToolbar().getByRole('button', { name: /^Выбрано / });
  await iconPickerTrigger.click();
  const iconPicker = window.getByRole('dialog', { name: 'Выбор иконки' });
  const iconSearch = iconPicker.getByRole('searchbox', { name: 'Поиск иконки' });
  await iconSearch.fill('Пользователь');
  await iconSearch.press('Tab');
  await expect(iconPicker.getByRole('button', { name: 'Очистить поиск' })).toBeFocused();
  await window.keyboard.press('Tab');
  await expect(iconPicker.getByRole('button', { name: 'Пользователь', exact: true })).toBeFocused();
  await window.keyboard.press('Escape');
  await expect(iconPickerTrigger).toBeFocused();
  await openInspectorSection('Цвета');
  await elementToolbar().getByLabel('Иконка: HEX').fill('#c2410c');
  await elementToolbar().getByLabel('Иконка: HEX').press('Enter');
  await elementToolbar().getByRole('checkbox', { name: 'Прозрачный фон' }).check();
  await elementToolbar().getByRole('checkbox', { name: 'Показывать границу' }).uncheck();
  await openInspectorSection('Поле');
  await elementToolbar().getByRole('checkbox', { name: 'Показывать подпись' }).uncheck();
  await elementToolbar().getByRole('checkbox', { name: 'Показывать placeholder' }).uncheck();
  await expect(textField.locator('.field-label')).toHaveCount(0);
  await expect(textField.getByRole('textbox')).toHaveAttribute('placeholder', '');
  await expect.poll(() => textField.locator('.field-leading').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(194, 65, 12)');
  await expect.poll(() => textField.locator('.field-control').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => textField.locator('.field-control').evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px');
  await expect(elementToolbar().getByRole('button', { name: 'Текст', exact: true })).toHaveCount(0);
  const horizontal = elementToolbar().getByRole('group', { name: 'Выравнивание текста', exact: true });
  const vertical = elementToolbar().getByRole('group', { name: 'Вертикальное выравнивание', exact: true });
  await horizontal.getByRole('button', { name: 'По центру', exact: true }).click();
  await expect(horizontal.getByRole('button', { name: 'По центру', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => textField.getByRole('textbox').evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');

  await expectNoGeometryControls();
  const widthBefore = (await textField.boundingBox())!.width;
  await dragBy(textField.getByRole('button', { name: 'Изменить размер текстового поля' }), 30, 0);
  expect((await textField.boundingBox())!.width).toBeGreaterThan(widthBefore + 15);
  await expect.poll(() => textField.getByRole('textbox').evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');
  await horizontal.getByRole('button', { name: 'По правому краю', exact: true }).click();
  await vertical.getByRole('button', { name: 'Сверху', exact: true }).click();
  await expect(horizontal.getByRole('button', { name: 'По правому краю', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(vertical.getByRole('button', { name: 'Сверху', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => textField.getByRole('textbox').evaluate((node) => getComputedStyle(node).textAlign)).toBe('right');
  await vertical.getByRole('button', { name: 'По середине', exact: true }).click();
  await expect(textField.getByRole('textbox')).toHaveCSS('align-self', 'center');
  await horizontal.getByRole('button', { name: 'По левому краю', exact: true }).click();
  await vertical.getByRole('button', { name: 'Снизу', exact: true }).click();
  await expect(horizontal.getByRole('button', { name: 'По правому краю', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(vertical.getByRole('button', { name: 'Сверху', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(horizontal.getByRole('button', { name: 'По левому краю', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(vertical.getByRole('button', { name: 'Снизу', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => textField.getByRole('textbox').evaluate((node) => getComputedStyle(node).textAlign)).toBe('left');
  await expect.poll(async () => {
    const controlBox = await textField.locator('.field-control').boundingBox();
    const textareaBox = await textField.getByRole('textbox').boundingBox();
    if (!controlBox || !textareaBox) return Number.POSITIVE_INFINITY;
    return Math.abs(controlBox.y + controlBox.height - textareaBox.y - textareaBox.height);
  }).toBeLessThan(3);
  await window.screenshot({ path: screenshotPaths.field, fullPage: false });

  await addElement(/^Выпадающий список/);
  const selectField = window.getByTestId('select-field-element');
  await expect(selectField).toHaveCount(1);
  await openInspectorSection('Варианты');
  await elementToolbar().getByLabel('Подпись', { exact: true }).fill('Пакет услуг');
  await elementToolbar().getByLabel('Placeholder', { exact: true }).fill('Выберите пакет услуг');
  await openInspectorSection('Варианты');
  await elementToolbar().getByRole('button', { name: 'Добавить вариант' }).click();
  await elementToolbar().getByRole('textbox', { name: 'Вариант 3', exact: true }).fill('Премиальный пакет с очень длинным названием для международного коммерческого предложения');
  await elementToolbar().getByRole('button', { name: 'Варианты', exact: true }).click();
  const selectedOptionId = await selectField.locator('select option').nth(3).getAttribute('value');
  expect(selectedOptionId).toBeTruthy();
  await selectField.locator('select').selectOption(selectedOptionId!);
  await expect(selectField.locator('select')).toHaveValue(selectedOptionId!);

  await addElement(/^Таблица/);
  const tables = window.getByTestId('table-element');
  await expect(tables).toHaveCount(2);
  const newTable = tables.nth(1);
  await newTable.locator('textarea').nth(0).dblclick();
  await newTable.locator('textarea').nth(0).fill('Очень длинное русское значение без выхода за границы компонента и с корректным переносом строк');
  await newTable.locator('textarea').nth(1).dblclick();
  await newTable.locator('textarea').nth(1).fill('LongEnglishValueWithoutSpacesThatMustWrapInsideTheTableCellWithoutBreakingTheDocument');
  await window.screenshot({ path: screenshotPaths.table, fullPage: false });

  await addElement(/^Текст Свободный/);
  const newText = window.getByTestId('text-element').last();
  await newText.getByRole('textbox', { name: 'Текст на странице' }).fill('Первая строка с длинным русским текстом\nSecond line with a very long English value that must wrap inside the fixed frame.');
  await openGeometryFixture((project) => {
    project.pages[0].elements.filter((element) => element.type === 'text').at(-1)!.rect.height = 6;
  });
  await newText.getByRole('textbox', { name: 'Текст на странице' }).click();
  await expect(newText.locator('.overflow-warning')).toBeVisible();

  await window.getByRole('button', { name: 'Открыть предпросмотр' }).click();
  await expect(window.locator('.app-shell')).toHaveClass(/mode-preview/);
  await expect(window.locator('.editor-sidebar')).toHaveCount(0);
  await expect(window.locator('.page-meta')).toHaveCount(0);
  await expect(window.getByTestId('editor-overlay')).toHaveCount(0);
  await expect(window.locator('.canvas-col input, .canvas-col textarea, .canvas-col select')).toHaveCount(0);
  await expect(window.getByRole('button', { name: /^Удалить строку/ })).toHaveCount(0);
  await expect(window.locator('.app-shell > [role="status"]')).toHaveCount(1);
  await expect(window.getByText('sales.department.with.a.very.long.address@example-company.test')).toBeVisible();
  await expect(textField.locator('.field-label')).toHaveCount(0);
  await expect.poll(() => textField.locator('.field-presentation').evaluate((node) => ({
    display: getComputedStyle(node).display,
    alignContent: getComputedStyle(node).alignContent
  }))).toEqual({ display: 'grid', alignContent: 'end' });
  await window.screenshot({ path: screenshotPaths.preview, fullPage: false });

  await window.getByRole('button', { name: 'Вернуться к редактированию' }).click();
  await expect(textField.getByRole('textbox')).toHaveValue('sales.department.with.a.very.long.address@example-company.test');
  await expect(selectField.locator('select')).toHaveValue(selectedOptionId!);

  await window.setViewportSize({ width: 1024, height: 768 });
  await expect(window.locator('.app-header')).toBeVisible();
  await expect.poll(() => window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await window.screenshot({ path: screenshotPaths.narrow, fullPage: false });

  await saveFileFromMenu();
  await expect.poll(() => existsSync(projectPath)).toBe(true);
  const saved = JSON.parse(readFileSync(projectPath, 'utf8')) as {
    schemaVersion: number;
    pages: Array<{ elements: Array<{
      type: string;
      showLabel?: boolean;
      showPlaceholder?: boolean;
      textAlign?: string;
      verticalAlign?: string;
      style?: { iconColor?: string; backgroundTransparent?: boolean; borderVisible?: boolean };
    }> }>;
  };
  expect(saved.schemaVersion).toBe(4);
  expect(saved.pages[0].elements.find((element) => element.type === 'textField')).toMatchObject({
    showLabel: false,
    showPlaceholder: false,
    textAlign: 'left',
    verticalAlign: 'bottom',
    style: { iconColor: '#c2410c', backgroundTransparent: true, borderVisible: false }
  });
  expect(saved.pages[0].elements.some((element) => element.type === 'selectField')).toBe(true);

  await window.getByRole('button', { name: 'Файл', exact: true }).click();
  await window.getByRole('menuitem', { name: 'Открыть', exact: true }).click();
  await expect(window.getByText(/Открыт markd-e2e-proposal.markd/)).toBeVisible();
  await expect(window.getByTestId('text-field-element').getByRole('textbox')).toHaveValue('sales.department.with.a.very.long.address@example-company.test');
  await expect(window.getByTestId('text-field-element').locator('.field-label')).toHaveCount(0);
  await expect.poll(() => window.getByTestId('text-field-element').locator('.field-control').evaluate((node) => ({
    backgroundColor: getComputedStyle(node).backgroundColor,
    borderTopWidth: getComputedStyle(node).borderTopWidth
  }))).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px' });

  await window.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect.poll(() => existsSync(pdfPath)).toBe(true);
  await expect.poll(() => statSync(pdfPath).size).toBeGreaterThan(1_000);
  for (const [name, path] of Object.entries(screenshotPaths)) {
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1_000);
    await test.info().attach(name, { path, contentType: 'image/png' });
  }
  await test.info().attach('exported-document', { path: pdfPath, contentType: 'application/pdf' });
  expect(runtimeErrors).toEqual([]);
});
