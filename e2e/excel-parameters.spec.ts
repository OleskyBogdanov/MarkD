import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { writeExcelFixture } from './fixtures/excelWorkbook';
import {
  catalogHeaders, createWorkbookBuffer, productRow
} from '../src/main/import/__tests__/xlsxFixture';

for (const width of [1440, 390]) {
  test(`shows every generator parameter in its own catalog column at ${width}px`, async () => {
    const testInfo = test.info();
    const directory = mkdtempSync(join(tmpdir(), 'markd-parameters-'));
    const workbook = join(directory, 'catalog.xlsx');
    writeExcelFixture(workbook, 12);
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'),
        MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
      }
    });
    const errors: string[] = [];
    try {
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, workbook);
      const page = await app.firstWindow();
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
      await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
      await page.getByRole('button', { name: 'Заполнить таблицу из Excel', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const catalog = dialog.getByRole('table').first();
      const firstProduct = catalog.getByRole('row').filter({
        has: page.getByRole('cell', { name: 'AD-TEST-1', exact: true })
      });
      await expect(catalog.getByRole('columnheader')).toHaveText([
        'Модель ДГУ', 'Исполнение', 'На складе', 'Открытая: склад, шт.', 'Кожух: склад, шт.',
        'Цена, ₽', 'АВР', 'Количество',
        'Марка двигателя', 'Модель двигателя', 'Номинальная мощность, кВт',
        'Номинальная мощность, кВА', 'Резервная мощность, кВт', 'Модель альтернатора',
        'Цена АВР, р.', 'Ток АВР, А',
        'Открытая: габариты, мм', 'Кожух: габариты, мм', 'Открытая: масса, кг', 'Кожух: масса, кг',
        'Выбор'
      ]);
      await expect(firstProduct.getByRole('cell')).toHaveCount(21);
      await expect(firstProduct.getByRole('cell').nth(2)).toHaveText('5');
      expect((await firstProduct.getByRole('cell').allTextContents()).slice(3, 5)).toEqual(['2', '3']);
      await expect(firstProduct.getByRole('cell').nth(5)).toHaveText('515 899');
      expect((await firstProduct.getByRole('cell').allTextContents()).slice(8, 20)).toEqual([
        'TestEngine', 'ENGINE-1', '20', '25', '22', 'ALTERNATOR-1',
        '45 000', '100А',
        '1500 × 700 × 1000', '1900 × 900 × 1200', '520', '680'
      ]);
      await expect(catalog.getByRole('row')).toHaveCount(13);
      await expect(dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }))
        .toHaveAttribute('aria-pressed', 'false');
      expect(await dialog.locator('.excel-fill-body').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`parameters-${width}.png`) });
      const scroller = dialog.getByLabel('Каталог Excel', { exact: true });
      await scroller.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => scroller.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      await catalog.getByRole('columnheader', { name: 'Кожух: масса, кг', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`parameters-${width}-columns.png`) });
      await dialog.getByRole('button', { name: 'Выбрать AD-TEST-1', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Выбрано AD-TEST-1', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');
      const variant = dialog.getByRole('combobox', { name: 'Исполнение AD-TEST-1', exact: true });
      await variant.selectOption('open');
      await expect(firstProduct.getByRole('cell').nth(5)).toHaveText('450 000');
      await variant.selectOption('enclosed');
      await expect(firstProduct.getByRole('cell').nth(5)).toHaveText('515 899');
      await catalog.getByRole('columnheader', { name: 'Кожух: масса, кг', exact: true }).scrollIntoViewIfNeeded();
      await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await expect(catalog.getByRole('columnheader', { name: 'Кожух: масса, кг', exact: true })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`parameters-${width}-scrolled.png`) });
      await dialog.getByRole('button', { name: 'Готово', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`parameters-${width}-footer.png`) });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Заполнить таблицу из Excel', exact: true })).toBeFocused();
      expect(errors).toEqual([]);
    } finally {
      await app.evaluate(({ app: nativeApp }) => nativeApp.exit(0));
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('total stock adds both variants, preserves missing values and zero, and ignores variant selection', async () => {
  const cases = [
    { open: 2, enclosed: 3, expected: ['5', '2', '3'] },
    { open: null, enclosed: 3, expected: ['3', '—', '3'] },
    { open: 2, enclosed: null, expected: ['2', '2', '—'] },
    { open: 0, enclosed: 0, expected: ['0', '0', '0'] },
    { open: null, enclosed: null, expected: ['—', '—', '—'] },
    { open: 0, enclosed: null, expected: ['0', '0', '—'] },
    { open: Number.MAX_SAFE_INTEGER, enclosed: 2,
      expected: ['9007199254740993', '9007199254740991', '2'] }
  ];
  const directory = mkdtempSync(join(tmpdir(), 'markd-stock-'));
  const workbook = join(directory, 'stock.xlsx');
  writeFileSync(workbook, createWorkbookBuffer([{
    name: 'Склад',
    rows: [...catalogHeaders, ...cases.map((item, index) => {
      const row = [...productRow];
      row[0] = `STOCK-${index + 1}`;
      row[2] = item.open;
      row[3] = item.enclosed;
      row[9] = 450000;
      return row;
    })]
  }]));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env, NODE_ENV: 'production', MARKD_USER_DATA_DIR: join(directory, 'profile'),
      MARKD_E2E_HEADLESS: process.env.CI && process.platform === 'win32' ? '0' : '1'
    }
  });
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, workbook);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
    await page.getByRole('button', { name: 'Импортировать Excel', exact: true }).click();
    await page.getByRole('button', { name: 'Заполнить таблицу из Excel', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const rows = dialog.getByRole('table').first().getByRole('row');
    for (const [index, item] of cases.entries()) {
      expect((await rows.nth(index + 1).getByRole('cell').allTextContents()).slice(2, 5)).toEqual(item.expected);
    }
    await dialog.getByRole('button', { name: 'Выбрать STOCK-1', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Исполнение STOCK-1', exact: true }).selectOption('open');
    expect((await rows.nth(1).getByRole('cell').allTextContents()).slice(2, 5)).toEqual(['5', '2', '3']);
  } finally {
    await app.evaluate(({ app: nativeApp }) => nativeApp.exit(0));
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
