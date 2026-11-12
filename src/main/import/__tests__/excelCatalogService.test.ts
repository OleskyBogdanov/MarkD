import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { excelCatalogSchema } from '../../../shared/excelCatalog.js';
import { EXCEL_IMPORT_LIMITS, importExcelCatalog } from '../excelCatalogService.js';
import { catalogHeaders, createWorkbookBuffer, productRow, workbookEntries, zipFixture, type FixtureCell } from './xlsxFixture.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function importBuffer(buffer: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'markd-xlsx-'));
  directories.push(directory);
  const path = join(directory, 'catalog.xlsx');
  await writeFile(path, buffer);
  return importExcelCatalog(path);
}

function withProduct(row: FixtureCell[]) {
  return createWorkbookBuffer([{ name: 'Прайс', rows: [...catalogHeaders, ['Раздел'], row] }]);
}

describe('Excel catalog import', () => {
  test('reads merged warehouse headers and skips sections, total and notes', async () => {
    const catalog = await importBuffer(createWorkbookBuffer());
    expect(catalog.fileName).toBe('catalog.xlsx');
    expect(catalog.sheets).toHaveLength(1);
    expect(catalog.sheets[0].products).toEqual([{
      id: 'sheet-1:row-6', sourceRow: 6, model: 'AD-20-R', engineBrand: 'Ricardo', engineModel: 'ZH4100D',
      nominalPowerKw: '', nominalPowerKva: '', standbyPowerKw: '', alternatorModel: '',
      openDimensionsMm: '', enclosedDimensionsMm: '', openWeightKg: '', enclosedWeightKg: '',
      openStock: null, enclosedStock: 3, openPriceKopecks: null, enclosedPriceKopecks: 51589900,
      avrPriceKopecks: 4500000, avrRating: '100А', issues: []
    }]);
    expect(excelCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  test('skips a Cyrillic total containing nonempty warehouse stock', async () => {
    const total: FixtureCell[] = ['ИТОГО на складе', null, null, 70];
    const catalog = await importBuffer(createWorkbookBuffer([{
      name: 'Прайс', rows: [...catalogHeaders, ['Раздел'], productRow, total, ['Примечания']]
    }]));
    expect(catalog.sheets[0].products).toHaveLength(1);
  });

  test('retains an unfamiliar incomplete model instead of silently discarding it', async () => {
    const product = (await importBuffer(withProduct(['GENERATOR-1']))).sheets[0].products[0];
    expect(product.model).toBe('GENERATOR-1');
    expect(product.issues).toHaveLength(2);
  });

  test('normalizes strings and preserves original rows and distinct duplicate models', async () => {
    const row = [...productRow];
    row[1] = '  Ricardo\n  Power ';
    const catalog = await importBuffer(createWorkbookBuffer([{
      name: 'Прайс', rows: [...catalogHeaders, ['Раздел'], row, [], row]
    }]));
    expect(catalog.sheets[0].products.map(product => [product.sourceRow, product.engineBrand, product.id]))
      .toEqual([[6, 'Ricardo Power', 'sheet-1:row-6'], [8, 'Ricardo Power', 'sheet-1:row-8']]);
  });

  test.each([
    [1.005, 101], ['1,005', 101], ['1 234,567', 123457], [0, 0],
    ['0.0049', 0], ['0.005', 1], ['90071992547409.91', Number.MAX_SAFE_INTEGER],
    [null, null], ['-1', null], ['NaN', null], ['1.234,56', null], ['90071992547409.92', null]
  ])('normalizes price %s to %s kopecks', async (input, expected) => {
    const row = [...productRow];
    row[10] = input;
    const { sheets } = await importBuffer(withProduct(row));
    expect(sheets[0].products[0].enclosedPriceKopecks).toBe(expected);
    expect(sheets[0].products[0].issues.length > 0).toBe(expected === null && input !== null);
  });

  test('shows incomplete products and invalid stock with issues', async () => {
    const row = [...productRow];
    row[0] = '';
    row[1] = '';
    row[3] = 1.5;
    row[7] = '';
    const product = (await importBuffer(withProduct(row))).sheets[0].products[0];
    expect(product.issues).toHaveLength(4);
    expect(product.enclosedStock).toBeNull();
  });

  test('keeps zero stock distinct from absent stock', async () => {
    const row = [...productRow];
    row[2] = 0;
    row[3] = null;
    const product = (await importBuffer(withProduct(row))).sheets[0].products[0];
    expect([product.openStock, product.enclosedStock]).toEqual([0, null]);
  });

  test('preserves all technical parameters and both variants through real XLSX parsing', async () => {
    const row: FixtureCell[] = [
      'AD-20-R', 'Ricardo', 0, 3, 20, '25,0', 22, 'ZH4100D', '  ALTERNATOR\n  20 ',
      450000, 515899, 45000, '100А', '1500 × 700 × 1000', '1900 × 900 × 1200', 520, 680
    ];
    const product = (await importBuffer(withProduct(row))).sheets[0].products[0];
    expect(product).toMatchObject({
      nominalPowerKw: '20', nominalPowerKva: '25,0', standbyPowerKw: '22',
      alternatorModel: 'ALTERNATOR 20',
      openStock: 0, enclosedStock: 3, openPriceKopecks: 45000000, enclosedPriceKopecks: 51589900,
      openDimensionsMm: '1500 × 700 × 1000', enclosedDimensionsMm: '1900 × 900 × 1200',
      openWeightKg: '520', enclosedWeightKg: '680'
    });
  });

  test('preserves zero technical values and leaves missing values empty', async () => {
    const row = [...productRow];
    row[4] = 0;
    row[15] = 0;
    const product = (await importBuffer(withProduct(row))).sheets[0].products[0];
    expect(product).toMatchObject({
      nominalPowerKw: '0', nominalPowerKva: '', standbyPowerKw: '', alternatorModel: '',
      openDimensionsMm: '', enclosedDimensionsMm: '', openWeightKg: '0', enclosedWeightKg: ''
    });
  });

  test('returns all compatible sheets, excluding unrelated sheets', async () => {
    const catalog = await importBuffer(createWorkbookBuffer([
      { name: 'Notes', rows: [['Notes']] },
      { name: 'First', rows: [...catalogHeaders, productRow] },
      { name: 'Second', rows: [...catalogHeaders, productRow] }
    ]));
    expect(catalog.sheets.map(sheet => [sheet.id, sheet.name])).toEqual([['sheet-2', 'First'], ['sheet-3', 'Second']]);
  });

  test('accepts whitespace changes in headers', async () => {
    const headers = catalogHeaders.map(row => [...row]);
    headers[2][0] = '  Модель\n ДГУ  ';
    expect((await importBuffer(createWorkbookBuffer([{ name: 'Sheet', rows: [...headers, productRow] }]))).sheets).toHaveLength(1);
  });

  test.each(['headers', 'subheaders', 'empty'])('rejects incompatible workbook: %s', async mode => {
    const rows = catalogHeaders.map(row => [...row]);
    if (mode === 'headers') rows[2][10] = 'Wrong price';
    if (mode === 'subheaders') rows[3][3] = 'Wrong stock';
    if (mode !== 'empty') rows.push(productRow);
    await expect(importBuffer(createWorkbookBuffer([{ name: 'Sheet', rows }]))).rejects.toThrow('Нет подходящих листов');
  });

  test.each(Array.from({ length: 17 }, (_, column) => column))('rejects formulas in catalog column %s even with cached values', async column => {
    const row = [...productRow];
    row[column] = { formula: '1+1', cached: 2 };
    await expect(importBuffer(withProduct(row))).rejects.toThrow('Формула в обязательной ячейке');
  });

  test('rejects cell errors clearly', async () => {
    const row = [...productRow];
    row[10] = { error: '#VALUE!' };
    await expect(importBuffer(withProduct(row))).rejects.toThrow('Ошибка Excel в ячейке K6');
  });

  test.each([4, 5, 6, 8, 13, 14, 15, 16])('rejects Excel errors in technical column %s', async column => {
    const row = [...productRow];
    row[column] = { error: '#VALUE!' };
    await expect(importBuffer(withProduct(row))).rejects.toThrow('Ошибка Excel в ячейке');
  });

  test('rejects corrupt archives', async () => {
    await expect(importBuffer(Buffer.from('not a workbook'))).rejects.toThrow('Не удалось импортировать Excel');
  });

  test.each(['A1:XFD1048576', 'A1:AG5', 'A1:Q2001'])('bounds dimensions before workbook parser allocations: %s', async dimension => {
    await expect(importBuffer(createWorkbookBuffer([{ name: 'Sheet', rows: [...catalogHeaders, productRow], dimension }])))
      .rejects.toThrow('Превышен лимит размеров');
  });

  test('checks cell addresses even when dimensions lie', async () => {
    const entries = workbookEntries([{ name: 'Sheet', rows: [...catalogHeaders, productRow] }]);
    entries['xl/worksheets/sheet1.xml'] = entries['xl/worksheets/sheet1.xml'].replace('r="K5"', 'r="K999999"');
    await expect(importBuffer(zipFixture(entries))).rejects.toThrow('Превышен лимит размеров');
  });

  test('does not treat drawing anchor rows as worksheet rows', async () => {
    const entries = workbookEntries([{ name: 'Sheet', rows: [...catalogHeaders, productRow] }]);
    entries['xl/drawings/drawing1.xml'] = '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:from><xdr:row>0</xdr:row></xdr:from></xdr:wsDr>';
    expect((await importBuffer(zipFixture(entries))).sheets[0].products).toHaveLength(1);
  });

  test('cannot bypass dimension checks by changing the XML namespace', async () => {
    const entries = workbookEntries([{ name: 'Sheet', rows: [...catalogHeaders, productRow], dimension: 'A1:XFD1048576' }]);
    entries['xl/worksheets/sheet1.xml'] = entries['xl/worksheets/sheet1.xml']
      .replace('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'urn:unexpected');
    await expect(importBuffer(zipFixture(entries))).rejects.toThrow('Превышен лимит размеров');
  });

  test('bounds long cell values', async () => {
    const row = [...productRow];
    row[0] = 'x'.repeat(EXCEL_IMPORT_LIMITS.textLength + 1);
    await expect(importBuffer(withProduct(row))).rejects.toThrow('Превышен лимит длины');
  });

  test('bounds decompressed content in highly compressed archives', async () => {
    const entries = workbookEntries([{ name: 'Sheet', rows: [...catalogHeaders, productRow] }]);
    entries['padding.bin'] = 'x'.repeat(EXCEL_IMPORT_LIMITS.expandedBytes);
    const bytes = zipFixture(entries);
    expect(bytes.length).toBeLessThan(100000);
    await expect(importBuffer(bytes)).rejects.toThrow('Превышен лимит распакованного Excel');
  });

  test('bounds sheets', async () => {
    await expect(importBuffer(createWorkbookBuffer(Array.from({ length: 17 }, (_, index) => ({
      name: `Sheet ${index}`, rows: [...catalogHeaders, productRow]
    }))))).rejects.toThrow('Превышен лимит листов');
  });

  test('bounds archive entry counts', async () => {
    await expect(importBuffer(zipFixture(Object.fromEntries(Array.from({ length: 257 }, (_, index) =>
      [`file${index}`, '']))))).rejects.toThrow('Превышен лимит файлов');
  });

  test('bounds compressed file bytes before archive inspection', async () => {
    await expect(importBuffer(Buffer.alloc(EXCEL_IMPORT_LIMITS.fileBytes + 1))).rejects.toThrow('Превышен лимит размера');
  });

  test('rejects DTD and malformed XML', async () => {
    const entries = workbookEntries([{ name: 'Sheet', rows: [...catalogHeaders, productRow] }]);
    entries['xl/workbook.xml'] = '<!DOCTYPE workbook><workbook/>';
    await expect(importBuffer(zipFixture(entries))).rejects.toThrow('DTD');
    entries['xl/workbook.xml'] = '<workbook>';
    await expect(importBuffer(zipFixture(entries))).rejects.toThrow('Не удалось импортировать Excel');
  });
});
