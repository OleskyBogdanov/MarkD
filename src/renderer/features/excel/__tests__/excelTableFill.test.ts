import { expect, test } from 'vitest';
import type { ExcelCatalogProduct, ExcelCatalogSheet } from '@/shared/excelCatalog';
import {
  formatExcelMoney,
  getExcelTableTargets,
  prepareExcelRows,
  type ExcelProductChoice
} from '../excelTableFill';
import { getExcelRowCells, suggestExcelColumnMapping, validateExcelColumnMapping } from '../excelColumnMapping';
import type { KpTableElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';

const product: ExcelCatalogProduct = {
  id: 'p6', sourceRow: 6, model: ' AD-20-R ', engineBrand: 'Ricardo', engineModel: 'ZH4100D',
  nominalPowerKw: '', nominalPowerKva: '', standbyPowerKw: '', alternatorModel: '',
  openDimensionsMm: '', enclosedDimensionsMm: '', openWeightKg: '', enclosedWeightKg: '',
  openStock: null, enclosedStock: 3, openPriceKopecks: 40_000_000,
  enclosedPriceKopecks: 51_589_900, avrPriceKopecks: 4_500_000, avrRating: '63', issues: []
};
const sheet: ExcelCatalogSheet = { id: 'sheet', name: 'Прайс', products: [product] };
const choice: ExcelProductChoice = { productId: product.id, variant: 'enclosed', withAvr: false, quantity: 1 };
const prepare = (patch: Partial<ExcelProductChoice> = {}, source = product) =>
  prepareExcelRows({ ...sheet, products: [source] }, [{ ...choice, ...patch }]);

test('names exactly match the chosen enclosure and AVR options', () => {
  for (const variant of ['open', 'enclosed'] as const) {
    for (const withAvr of [false, true]) {
      expect(prepare({ variant, withAvr })[0].name).toBe(
        `Дизельный генератор AD-20-R${variant === 'enclosed' ? ' в шумозащитном евро кожухе' : ''}${withAvr ? ' с АВР' : ''} Ricardo (ZH4100D)`
      );
    }
  }
});

test('AVR adds its price before quantity multiplication, and disabling it restores base price', () => {
  expect(prepare({ withAvr: true, quantity: 3 })[0]).toMatchObject({
    price: `${formatExcelMoney(56_089_900)} р.`, quantity: '3', total: `${formatExcelMoney(168_269_700)} р.`
  });
  expect(prepare()[0].price).toBe(`${formatExcelMoney(51_589_900)} р.`);
  expect(prepare({ variant: 'open' })[0].price).toBe(`${formatExcelMoney(40_000_000)} р.`);
});

test('prepared prices and totals include rubles while retaining kopecks and zero', () => {
  expect(prepare({ quantity: 3 }, { ...product, enclosedPriceKopecks: 10_025 })[0]).toMatchObject({
    price: '100,25 р.', quantity: '3', total: '300,75 р.'
  });
  expect(prepare({}, { ...product, enclosedPriceKopecks: 0 })[0]).toMatchObject({
    price: '0 р.', quantity: '1', total: '0 р.'
  });
  expect(prepare({ withAvr: true, quantity: 2 }, {
    ...product, enclosedPriceKopecks: 10_025, avrPriceKopecks: 50
  })[0]).toMatchObject({ price: '100,75 р.', total: '201,50 р.' });
});

test('money preserves kopecks and formats Russian grouping without a currency symbol', () => {
  expect(formatExcelMoney(123456789)).toBe(`1\u00a0234\u00a0567,89`);
  expect(formatExcelMoney(Number.MAX_SAFE_INTEGER)).toBe(`90\u00a0071\u00a0992\u00a0547\u00a0409,91`);
  expect(formatExcelMoney(0)).toBe('0');
});

test('missing variant price never falls back, and AVR requires its own valid price', () => {
  expect(() => prepare({ variant: 'open' }, { ...product, openPriceKopecks: null })).toThrow(/цены/);
  expect(() => prepare({ withAvr: true }, { ...product, avrPriceKopecks: null })).toThrow(/АВР/);
  expect(() => prepare({ withAvr: true }, { ...product, avrPriceKopecks: -1 })).toThrow(/АВР/);
  expect(prepare({}, { ...product, avrPriceKopecks: null })).toHaveLength(1);
});

test.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %s', (quantity) => {
  expect(() => prepare({ quantity })).toThrow(/количество/);
});

test('rejects incomplete required data, invalid money, addition and multiplication overflow', () => {
  expect(() => prepare({}, { ...product, engineModel: ' ' })).toThrow(/модель двигателя/);
  expect(() => prepare({}, { ...product, enclosedPriceKopecks: 1.5 })).toThrow(/цены/);
  expect(() => prepare({ withAvr: true }, { ...product, enclosedPriceKopecks: Number.MAX_SAFE_INTEGER })).toThrow(/превышает/);
  expect(() => prepare({ quantity: Number.MAX_SAFE_INTEGER })).toThrow(/превышает/);
});

test('keeps distinct source rows and workbook order regardless of selection order', () => {
  const second = { ...product, id: 'p7', sourceRow: 7, engineModel: 'second' };
  const result = prepareExcelRows({ ...sheet, products: [product, second] }, [
    { ...choice, productId: second.id }, choice
  ]);
  expect(result).toHaveLength(2);
  expect(result[0].name).toContain('(ZH4100D)');
  expect(result[1].name).toContain('(second)');
  expect(() => prepareExcelRows(sheet, [choice, choice])).toThrow(/несколько/);
  expect(() => prepareExcelRows(sheet, [{ ...choice, productId: 'missing' }])).toThrow(/отсутствует/);
});

test('mapping configures every destination ID, including repeated recognized headers and unknown columns', () => {
  const columns = [
    { id: 'total-id', label: 'Сумма, р.' }, { id: 'qty-id', label: ' Кол-во ' },
    { id: 'name-id', label: 'Наименование' }, { id: 'price-id', label: 'Цена, р.' },
    { id: 'number-id', label: '№ п/п' }, { id: 'unit-id', label: 'Ед. изм.' },
    { id: 'extra-id', label: 'Примечание' }, { id: 'another-price', label: 'Цена' }
  ];
  const mapping = suggestExcelColumnMapping(columns);
  expect(mapping).toEqual({
    'total-id': { source: 'total' }, 'qty-id': { source: 'quantity' },
    'name-id': { source: 'name' }, 'price-id': { source: 'price' },
    'number-id': { source: 'number' }, 'unit-id': { source: 'unit', value: 'шт.' },
    'extra-id': { source: 'skip' }, 'another-price': { source: 'price' }
  });
  expect(() => validateExcelColumnMapping(columns.map(({ id }) => id), mapping)).not.toThrow();
});

test.each([
  ['№', 'number'], ['№ п/п', 'number'], ['Номер', 'number'], ['Ед.', 'unit'], ['Ед. изм.', 'unit'],
  ['Цена,р.', 'price'], ['Цена₽', 'price'],
  ['наименование товара', 'name'], ['название', 'name'], ['цена за единицу', 'price'],
  ['количество', 'quantity'], ['кол во', 'quantity'], ['стоимость', 'total'], ['итого', 'total']
] as const)('suggests the source for %s', (label, source) => {
  expect(suggestExcelColumnMapping([{ id: 'column', label }])).toEqual({
    column: source === 'unit' ? { source, value: 'шт.' } : { source }
  });
});

test('mapping accepts repeated sources, trimmed custom units, and the maximum unit length', () => {
  expect(() => validateExcelColumnMapping(['a', 'b', 'c'], {
    a: { source: 'name' }, b: { source: 'name' }, c: { source: 'unit', value: ' комплект ' }
  })).not.toThrow();
  expect(() => validateExcelColumnMapping(['a'], {
    a: { source: 'unit', value: 'я'.repeat(64) }
  })).not.toThrow();
});

test('mapping rejects missing or extra IDs, all skipped columns, and invalid units', () => {
  expect(() => validateExcelColumnMapping(['a', 'b'], { a: { source: 'name' } })).toThrow();
  expect(() => validateExcelColumnMapping(['a'], {
    a: { source: 'name' }, deleted: { source: 'price' }
  })).toThrow();
  expect(() => validateExcelColumnMapping(['a'], { a: { source: 'skip' } })).toThrow();
  for (const value of ['', ' \t ', 'я'.repeat(65)]) {
    expect(() => validateExcelColumnMapping(['a'], { a: { source: 'unit', value } })).toThrow();
  }
  const unknownSource = JSON.parse('{"a":{"source":"unknown"}}') as Parameters<typeof validateExcelColumnMapping>[1];
  expect(() => validateExcelColumnMapping(['a'], unknownSource)).toThrow();
  const missingUnit = JSON.parse('{"a":{"source":"unit"}}') as Parameters<typeof validateExcelColumnMapping>[1];
  expect(() => validateExcelColumnMapping(['a'], missingUnit)).toThrow();
});

const makeTable = (columns: string[], values: string[][], firstRowHeader = true): KpTableElement => {
  useEditorStore.getState().resetProject();
  const original = useEditorStore.getState().project.pages[0].elements.find((element) => element.type === 'table');
  if (!original || original.type !== 'table') throw new Error('Table missing');
  return {
    ...structuredClone(original), columns, firstRowHeader,
    rows: values.map((texts, rowIndex) => ({
      id: `row-${rowIndex}`,
      cells: texts.map((text, index) => ({ id: `cell-${rowIndex}-${index}`, text, widthMm: 25 }))
    }))
  };
};

test('row cells follow a reordered seven-column destination with numbering, custom unit, and skip', () => {
  const table = makeTable(['total', 'number', 'unit', 'name', 'extra', 'price', 'quantity'], [
    ['Сумма', '№', 'Ед.', 'Наименование', 'Примечание', 'Цена', 'Кол-во'],
    ['', '7', '', '', 'Keep this note', '', '']
  ]);
  const before = structuredClone(table);
  const row = prepare({ withAvr: true })[0];
  expect(getExcelRowCells(table, {
    total: { source: 'total' }, number: { source: 'number' },
    unit: { source: 'unit', value: ' комплект ' }, name: { source: 'name' },
    extra: { source: 'skip' }, price: { source: 'price' }, quantity: { source: 'quantity' }
  }, [row, row])).toEqual([
    [row.total, '8', 'комплект', row.name, '', row.price, row.quantity],
    [row.total, '9', 'комплект', row.name, '', row.price, row.quantity]
  ]);
  expect(table).toEqual(before);
});

test('each number column continues independently after its maximum valid nonnegative integer', () => {
  const table = makeTable(['a', 'b'], [
    ['999', '999'], ['4', '8'], ['2', '3'], ['', ''], ['-5', '1.5'], ['invalid', 'NaN']
  ]);
  const mapping = { a: { source: 'number' }, b: { source: 'number' } } as const;
  const row = prepare()[0];
  expect(getExcelRowCells(table, mapping, [row, row])).toEqual([['5', '9'], ['6', '10']]);
  table.firstRowHeader = false;
  expect(getExcelRowCells(table, mapping, [row])).toEqual([['1000', '1000']]);
});

test('numbering starts at one for blanks and rejects a batch exceeding safe integers without mutation', () => {
  const table = makeTable(['number'], [['№'], ['']]);
  const mapping = { number: { source: 'number' } } as const;
  const row = prepare()[0];
  expect(getExcelRowCells(table, mapping, [row])).toEqual([['1']]);
  table.rows[1].cells[0].text = String(Number.MAX_SAFE_INTEGER - 1);
  expect(getExcelRowCells(table, mapping, [row])).toEqual([[String(Number.MAX_SAFE_INTEGER)]]);
  const before = structuredClone(table);
  expect(() => getExcelRowCells(table, mapping, [row, row])).toThrow();
  expect(table).toEqual(before);
});

test('targets include original tables with structure and layer availability reasons', () => {
  useEditorStore.getState().resetProject();
  const project = structuredClone(useEditorStore.getState().project);
  const page = project.pages[0];
  const table = page.elements.find((element) => element.type === 'table')!;
  expect(table.columns).toHaveLength(3);
  expect(getExcelTableTargets(project)[0].unavailableReason).toBeNull();
  table.columns.push('total');
  table.rows[0].cells.push({ id: 'total-cell', text: 'Сумма', widthMm: 35 });
  expect(getExcelTableTargets(project)).toHaveLength(1);
  expect(getExcelTableTargets(project)[0]).toMatchObject({ pageId: page.id, tableId: table.id, unavailableReason: null });
  expect(getExcelTableTargets(project)[0].columns[0].label).toBe('Наименование');
  table.firstRowHeader = false;
  expect(getExcelTableTargets(project)[0].columns[0].label).toBe('Колонка 1');
  table.rows[0].cells.pop();
  expect(getExcelTableTargets(project)[0].unavailableReason).toContain('ячеек');
  table.columns[3] = table.columns[0];
  expect(getExcelTableTargets(project)[0].unavailableReason).toContain('уникальными');
  project.layers[0].locked = true;
  expect(getExcelTableTargets(project)[0].unavailableReason).toContain('заблокирован');
  project.layers[0].visible = false;
  expect(getExcelTableTargets(project)[0].unavailableReason).toContain('скрыт');
});

test('a one-column rectangular table is available, but empty columns and rows are not', () => {
  useEditorStore.getState().resetProject();
  const project = structuredClone(useEditorStore.getState().project);
  const table = project.pages[0].elements.find((element) => element.type === 'table')!;
  table.columns = table.columns.slice(0, 1);
  table.rows = table.rows.map((row) => ({ ...row, cells: row.cells.slice(0, 1) }));
  expect(getExcelTableTargets(project)[0].unavailableReason).toBeNull();
  table.rows = [];
  expect(getExcelTableTargets(project)[0].unavailableReason).not.toBeNull();
  table.columns = [];
  expect(getExcelTableTargets(project)[0].unavailableReason).not.toBeNull();
});
