import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { projectSchema, type KpProject } from '../src/shared/projectSchema';
import { measureTextContent } from '../src/renderer/components/ui/textMeasurement';

let app: ElectronApplication;
let page: Page;
let directory: string;
let filePath: string;
let project: KpProject;

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-overflow-'));
  filePath = join(directory, 'overflow.markd');
  const now = new Date().toISOString();
  project = projectSchema.parse({
    schemaVersion: 4,
    metadata: { id: 'overflow', title: 'Overflow', createdAt: now, updatedAt: now },
    orientation: 'portrait',
    layers: [{ id: 'layer_main', name: 'Main', order: 0 }],
    pages: [{
      id: 'page', widthMm: 210, heightMm: 297,
      elements: [
        { id: 'text', type: 'text', rect: { x: 20, y: 20, width: 80, height: 5 }, text: 'Fits', style: { fontSize: 12 } },
        { id: 'shape', type: 'shape', shape: 'rectangle', rect: { x: 20, y: 40, width: 80, height: 10 }, text: 'Fits', style: {}, textStyle: { fontSize: 12 } },
        { id: 'field', type: 'textField', rect: { x: 20, y: 60, width: 80, height: 15 }, label: 'Label', value: 'Fits', placeholder: 'Placeholder', style: {} },
        { id: 'select', type: 'selectField', rect: { x: 20, y: 80, width: 80, height: 15 }, label: 'Selection', placeholder: 'Choose', selectedOptionId: 'one', options: [{ id: 'one', label: 'Fits' }], style: {} }
      ]
    }],
    assets: []
  });
  writeFileSync(filePath, JSON.stringify(project));
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'), MARKD_E2E_HEADLESS: '1' }
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, filePath);
  page = await app.firstWindow();
  await page.getByRole('button', { name: 'Открыть…', exact: true }).click();
  await expect(page.getByTestId('text-element')).toHaveCount(1);
});

const updateFixture = async (configure: (fixture: KpProject) => void): Promise<void> => {
  configure(project);
  writeFileSync(filePath, JSON.stringify(project));
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open' });
  });
};

test.afterEach(async () => {
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app?.close().catch(() => {});
  rmSync(directory, { recursive: true, force: true });
});

test('fitting text does not produce clipping warnings', async () => {
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 700, height: 560 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTitle('Текст не помещается в границы элемента')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`fitting-${viewport.width}.png`) });
  }
});

test('measurement ignores scroll padding and detects actual text clipping', async () => {
  await page.evaluate(() => document.fonts.ready);
  const text = page.getByRole('textbox', { name: 'Текст на странице', exact: true });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(false);
  await text.evaluate((node: HTMLTextAreaElement) => { node.value = 'First line\nSecond line\nThird line'; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(true);
  await text.evaluate((node: HTMLTextAreaElement) => { node.value = ''; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(false);
});

test('measurement follows wrapping, font metrics, labels and visible placeholders', async () => {
  await page.evaluate(() => document.fonts.ready);
  const field = page.getByTestId('text-field-element');
  const text = field.getByRole('textbox');
  await text.evaluate((node: HTMLTextAreaElement) => { node.value = ''; node.placeholder = 'A long placeholder '.repeat(30); });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(true);
  await text.evaluate((node: HTMLTextAreaElement) => { node.placeholder = ''; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(false);
  await text.evaluate((node: HTMLTextAreaElement) => { node.value = 'First\nSecond\nThird'; node.style.height = '15px'; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(true);
  await text.evaluate((node: HTMLTextAreaElement) => { node.value = 'Fits'; node.style.height = '30px'; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(false);
  await text.evaluate(node => { node.style.fontSize = '64px'; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(true);
  await text.evaluate(node => { node.style.fontSize = '12px'; node.style.fontWeight = '700'; node.style.fontStyle = 'italic'; });
  expect((await text.evaluate(measureTextContent)).clipped).toBe(false);
  const label = field.locator('label');
  await label.evaluate(node => { node.textContent = 'Long label '.repeat(30); });
  expect((await label.evaluate(measureTextContent)).clipped).toBe(true);
});

test('measurement detects clipped selected text and centered shape text', async () => {
  const select = page.getByTestId('select-field-element').getByRole('combobox');
  expect((await select.evaluate(measureTextContent)).clipped).toBe(false);
  await select.evaluate(node => { node.selectedOptions[0].textContent = 'A very long selected option '.repeat(10); });
  expect((await select.evaluate(measureTextContent)).clipped).toBe(true);
  const shape = page.getByTestId('shape-element').locator('.shape-text-presentation');
  expect((await shape.evaluate(measureTextContent)).clipped).toBe(false);
  await shape.evaluate(node => { node.textContent = 'First\nSecond\nThird\nFourth\nFifth'; });
  expect((await shape.evaluate(measureTextContent)).clipped).toBe(true);
  await shape.evaluate(node => { node.textContent = ''; });
  expect((await shape.evaluate(measureTextContent)).clipped).toBe(false);
});

test('measurement preserves glyph bounds across bundled font families', async () => {
  const text = page.getByTestId('text-field-element').getByRole('textbox');
  const families = await page.evaluate(() => [...new Set(Array.from(document.fonts, font => font.family))]);
  expect(families.length).toBeGreaterThan(10);
  for (const family of families) {
    await text.evaluate(async (node: HTMLTextAreaElement, font) => {
      const family = JSON.stringify(font.replace(/^['"]|['"]$/g, ''));
      await document.fonts.load(`italic 700 12px ${family}`, 'gЙ');
      node.value = 'gЙ';
      Object.assign(node.style, { fontFamily: family, fontSize: '12px', fontWeight: '700', fontStyle: 'italic', height: '30px', paddingTop: '4px', paddingBottom: '4px' });
    }, family);
    expect((await text.evaluate(measureTextContent)).clipped, family).toBe(false);
  }
});

test('warnings follow live buffered input before commit and disappear when text fits', async () => {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  const element = page.getByTestId('text-element');
  const text = element.getByRole('textbox');
  const warning = element.getByTitle('Текст не помещается в границы элемента');
  await text.focus();
  await expect(text).toBeFocused();
  await text.fill('First\nSecond\nThird');
  await page.clock.runFor(17);
  await expect(text).toHaveValue('First\nSecond\nThird');
  await expect(warning).toHaveCount(1);
  await text.fill('Fits');
  await page.clock.runFor(17);
  await expect(warning).toHaveCount(0);
  await text.fill('');
  await page.clock.runFor(17);
  await expect(warning).toHaveCount(0);
});

test('shape editing retains accurate warnings and preview omits warning chrome', async () => {
  const shape = page.getByTestId('shape-element');
  await shape.dblclick();
  const text = shape.getByRole('textbox', { name: 'Текст фигуры' });
  await text.fill('First\nSecond\nThird\nFourth\nFifth');
  const warning = shape.getByTitle('Текст не помещается в границы элемента');
  await expect(warning).toHaveCount(1);
  await text.press('Escape');
  await expect(warning).toHaveCount(1);
  await page.getByRole('button', { name: 'Открыть предпросмотр', exact: true }).click();
  await expect(page.getByTitle('Текст не помещается в границы элемента')).toHaveCount(0);
  await expect(page.getByTestId('editor-overlay')).toHaveCount(0);
});

test('selected shapes expose keyboard text editing without a floating text button', async () => {
  const shape = page.getByTestId('shape-element');
  await shape.click();
  await expect(shape.getByRole('button', { name: 'Редактировать текст фигуры' })).toHaveCount(0);
  await expect(shape).toHaveAttribute('tabindex', '0');
  await shape.focus();
  await shape.press('Enter');
  const text = shape.getByRole('textbox', { name: 'Текст фигуры' });
  await expect(text).toBeFocused();
  await text.fill('First');
  await text.press('End');
  await text.press('Enter');
  await expect(text).toHaveValue('First\n');
  await text.press('Escape');
  await expect(text).toHaveCount(0);
  await expect(shape).toBeFocused();
  await shape.press('F2');
  await expect(text).toBeFocused();
});

test('field warnings track hidden labels and placeholders and selected option text', async () => {
  const field = page.getByTestId('text-field-element');
  const warning = field.getByTitle('Текст не помещается в границы элемента');
  const longLabel = 'Long label '.repeat(30);
  await updateFixture(fixture => {
    const element = fixture.pages[0].elements.find(element => element.type === 'textField')!;
    element.label = longLabel;
  });
  await expect(field.locator('label')).toHaveText(longLabel.trim());
  await expect(warning).toHaveCount(1);
  await updateFixture(fixture => {
    const element = fixture.pages[0].elements.find(element => element.type === 'textField')!;
    element.showLabel = false;
    element.value = '';
    element.placeholder = 'A long placeholder '.repeat(30);
  });
  await expect(field.locator('label')).toHaveCount(0);
  await expect(warning).toHaveCount(1);
  await updateFixture(fixture => {
    const element = fixture.pages[0].elements.find(element => element.type === 'textField')!;
    element.showPlaceholder = false;
  });
  await expect(field.getByRole('textbox')).toHaveAttribute('placeholder', '');
  await expect(warning).toHaveCount(0);

  const select = page.getByTestId('select-field-element');
  await updateFixture(fixture => {
    const element = fixture.pages[0].elements.find(element => element.type === 'selectField')!;
    element.options[0].label = 'A long selected option '.repeat(30);
  });
  await expect(select.getByTitle('Текст не помещается в границы элемента')).toHaveCount(1);
});

test('warnings recalculate after geometry, typography and zoom changes', async () => {
  const element = page.getByTestId('text-element');
  const warning = element.getByTitle('Текст не помещается в границы элемента');
  await updateFixture(fixture => {
    const text = fixture.pages[0].elements.find(element => element.type === 'text')!;
    text.text = 'First\nSecond\nThird';
  });
  await expect(warning).toHaveCount(1);
  await updateFixture(fixture => {
    const text = fixture.pages[0].elements.find(element => element.type === 'text')!;
    text.rect.height = 20;
  });
  await expect(warning).toHaveCount(0);
  await updateFixture(fixture => {
    const text = fixture.pages[0].elements.find(element => element.type === 'text')!;
    text.style.fontSize = 36;
    text.style.fontId = 'pt-serif';
    text.style.bold = true;
    text.style.italic = true;
  });
  await expect(warning).toHaveCount(1);
  await updateFixture(fixture => {
    const text = fixture.pages[0].elements.find(element => element.type === 'text')!;
    text.style.fontSize = 12;
  });
  await expect(warning).toHaveCount(0);
  const footer = page.getByLabel('Нижняя панель документа', { exact: true });
  for (let index = 0; index < 3; index++) {
    await footer.getByRole('button', { name: /^Увеличить(?: масштаб)?$/ }).click();
    await expect(warning).toHaveCount(0);
  }
});

test('font loading refreshes warnings without changing element geometry', async () => {
  const text = page.getByTestId('text-element').getByRole('textbox');
  const warning = page.getByTestId('text-element').getByTitle('Текст не помещается в границы элемента');
  const font = readFileSync(join(process.cwd(), 'src/renderer/assets/fonts/inter/normal.woff2')).toString('base64');
  await expect(warning).toHaveCount(0);
  for (const size of [72, 12]) {
    await text.evaluate(async (node: HTMLTextAreaElement, { data, fontSize }) => {
      const family = `OverflowLate${fontSize}`;
      const face = new FontFace(family, `url(data:font/woff2;base64,${data})`);
      document.fonts.add(face);
      node.style.fontFamily = family;
      node.style.fontSize = `${fontSize}px`;
      await document.fonts.load(`${fontSize}px ${family}`, 'Fits');
      await document.fonts.ready;
    }, { data: font, fontSize: size });
    await expect(warning).toHaveCount(size === 72 ? 1 : 0);
  }
});

test('zoom preserves fitting text and the logical content area', async () => {
  await updateFixture(fixture => {
    const text = fixture.pages[0].elements.find(element => element.type === 'text');
    if (!text) throw new Error('The fixture must contain a text element.');
    text.text = 'Near fitting';
    text.rect.height = 7;
    text.style.fontSize = 16;
  });
  const canvas = page.getByRole('region', { name: 'Рабочая область документа' });
  const element = page.getByTestId('text-element');
  const content = element.locator('.canvas-element-content');
  await expect(element.getByRole('textbox')).toHaveValue('Near fitting');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTitle('Текст не помещается в границы элемента')).toHaveCount(0);
  const initial = await content.evaluate(node => node.getBoundingClientRect().height);
  for (const zoom of [0.25, 0.39, 0.6, 0.94, 1, 2]) {
    await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: 10000, cancelable: true });
    await expect(page.getByLabel('Текущий масштаб', { exact: true })).toHaveText('25%');
    if (zoom > 0.25) {
      await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: -Math.log(zoom / 0.25) / 0.002, cancelable: true });
    }
    await expect(page.getByLabel('Текущий масштаб', { exact: true })).toHaveText(`${Math.round(zoom * 100)}%`);
    await expect.poll(async () => (await content.evaluate(node => node.getBoundingClientRect().height)) / zoom).toBeCloseTo(initial, 1);
    await expect(page.getByTitle('Текст не помещается в границы элемента')).toHaveCount(0);
    await element.getByRole('textbox').fill('First\nSecond\nThird\nFourth');
    await expect(element.getByTitle('Текст не помещается в границы элемента')).toHaveCount(1);
    await element.getByRole('textbox').fill('Near fitting');
    await expect(page.getByTitle('Текст не помещается в границы элемента')).toHaveCount(0);
  }
});
