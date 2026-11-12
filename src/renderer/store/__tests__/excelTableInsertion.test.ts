import { beforeEach, expect, test } from 'vitest';
import { projectSchema, type KpTableElement } from '@/renderer/domain/model';
import { useEditorStore } from '../useEditorStore';
import type { ExcelTableInsertion } from '../excelTableInsertion';

const rows = [
  { name: 'ДГУ с АВР', price: '560 899 р.', quantity: '2', total: '1 121 798 р.' },
  { name: 'ДГУ без АВР', price: '515 899 р.', quantity: '1', total: '515 899 р.' }
];
let insertion: ExcelTableInsertion;
const getTable = (): KpTableElement => {
  const table = useEditorStore.getState().project.pages[0].elements.find((element) => element.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Table missing');
  return table;
};

beforeEach(() => {
  useEditorStore.getState().resetProject();
  const project = structuredClone(useEditorStore.getState().project);
  const table = project.pages[0].elements.find((element) => element.type === 'table')!;
  table.columns = ['total-id', 'extra-id', 'quantity-id', 'number-id', 'name-id', 'unit-id', 'price-id'];
  table.rows[0].cells = table.columns.map((id, index) => ({
    id: `header-${id}`, text: `Header ${id}`, widthMm: 20 + index,
    style: { bold: true }
  }));
  table.rows.push({
    id: 'existing-row',
    cells: table.columns.map((id, index) => ({
      id: `old-${id}`, text: id === 'number-id' ? '12' : `Old ${index}`, widthMm: 20 + index
    }))
  });
  table.style.rowHeights['existing-row'] = 60;
  useEditorStore.getState().setProject(project);
  const state = useEditorStore.getState();
  insertion = {
    sessionId: state.sessionId, pageId: project.pages[0].id, tableId: table.id,
    mapping: {
      'total-id': { source: 'total' }, 'extra-id': { source: 'skip' },
      'quantity-id': { source: 'quantity' }, 'number-id': { source: 'number' },
      'name-id': { source: 'name' }, 'unit-id': { source: 'unit', value: ' шт. ' },
      'price-id': { source: 'price' }
    },
    rows
  };
});

test('appends by column ID, preserves old rows and widths, and changes history exactly once', () => {
  const before = useEditorStore.getState();
  const oldTable = getTable();
  before.insertExcelRows(insertion);
  const after = useEditorStore.getState();
  const table = getTable();
  expect(table.rows.slice(0, 2)).toEqual(oldTable.rows);
  expect(table.rows[2].cells.map((cell) => cell.text)).toEqual([
    rows[0].total, '', rows[0].quantity, '13', rows[0].name, 'шт.', rows[0].price
  ]);
  expect(table.rows[3].cells.map((cell) => cell.text)).toEqual([
    rows[1].total, '', rows[1].quantity, '14', rows[1].name, 'шт.', rows[1].price
  ]);
  expect(table.rows[2].cells.map((cell) => cell.widthMm)).toEqual(oldTable.rows[0].cells.map((cell) => cell.widthMm));
  expect(table.rows[2].cells.every((cell) => cell.style === undefined)).toBe(true);
  expect(table.style).toEqual(oldTable.style);
  expect(table.firstRowHeader).toBe(true);
  expect(table.rect.height).toBeGreaterThan(oldTable.rect.height);
  expect(after.undoStack).toHaveLength(1);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.isDirty).toBe(true);
  expect(after.redoStack).toHaveLength(0);
  expect(projectSchema.parse(JSON.parse(JSON.stringify(after.project)))).toEqual(after.project);
  const ids = table.rows.flatMap((row) => [row.id, ...row.cells.map((cell) => cell.id)]);
  expect(new Set(ids).size).toBe(ids.length);
  after.undo();
  expect(getTable()).toEqual(oldTable);
  useEditorStore.getState().redo();
  expect(getTable()).toEqual(table);
});

test.each([
  'stale', 'deleted', 'page deleted', 'locked', 'hidden', 'inactive', 'missing mapping',
  'extra mapping', 'all skipped', 'empty unit', 'long unit', 'unknown source', 'missing unit',
  'ragged', 'empty rows', 'empty values'
] as const)(
  'rejects %s without a partial write or history mutation',
  (kind) => {
    const state = useEditorStore.getState();
    const project = structuredClone(state.project);
    const table = project.pages[0].elements.find((element) => element.type === 'table')!;
    if (kind === 'deleted') project.pages[0].elements = [];
    if (kind === 'locked') project.layers[0].locked = true;
    if (kind === 'hidden') project.layers[0].visible = false;
    if (kind === 'ragged') table.rows[0].cells.pop();
    useEditorStore.setState({ project, ...(kind === 'inactive' ? { activeLayerId: 'other' } : {}) });
    const mapping = { ...insertion.mapping };
    if (kind === 'missing mapping') delete mapping['price-id'];
    if (kind === 'extra mapping') mapping['deleted'] = { source: 'price' };
    if (kind === 'all skipped') {
      for (const id of table.columns) mapping[id] = { source: 'skip' };
    }
    if (kind === 'empty unit') mapping['unit-id'] = { source: 'unit', value: ' \t ' };
    if (kind === 'long unit') mapping['unit-id'] = { source: 'unit', value: 'я'.repeat(65) };
    if (kind === 'unknown source') {
      mapping['price-id'] = JSON.parse('{"source":"unknown"}') as ExcelTableInsertion['mapping'][string];
    }
    if (kind === 'missing unit') {
      mapping['unit-id'] = JSON.parse('{"source":"unit"}') as ExcelTableInsertion['mapping'][string];
    }
    const request: ExcelTableInsertion = {
      ...insertion,
      mapping,
      ...(kind === 'stale' ? { sessionId: insertion.sessionId - 1 } : {}),
      ...(kind === 'page deleted' ? { pageId: 'deleted' } : {}),
      ...(kind === 'empty rows' ? { rows: [] } : {}),
      ...(kind === 'empty values' ? { rows: [rows[0], { ...rows[1], name: '' }] } : {})
    };
    const before = useEditorStore.getState();
    expect(() => before.insertExcelRows(request)).toThrow();
    expect(useEditorStore.getState()).toBe(before);
    expect(useEditorStore.getState().project).toBe(project);
  }
);

test('repeated semantic sources fill each destination independently', () => {
  useEditorStore.getState().insertExcelRows({
    ...insertion,
    mapping: {
      ...insertion.mapping, 'extra-id': { source: 'name' }, 'unit-id': { source: 'unit', value: ' комплект ' }
    }
  });
  const table = getTable();
  expect(table.rows[2].cells.map((cell) => cell.text)).toEqual([
    rows[0].total, rows[0].name, rows[0].quantity, '13', rows[0].name, 'комплект', rows[0].price
  ]);
});

test('a reordered six-column table fills number, unit, and all four product fields', () => {
  const project = structuredClone(useEditorStore.getState().project);
  const table = project.pages[0].elements.find((element) => element.type === 'table')!;
  const extraIndex = table.columns.indexOf('extra-id');
  table.columns.splice(extraIndex, 1);
  for (const row of table.rows) row.cells.splice(extraIndex, 1);
  useEditorStore.setState({ project });
  const mapping = { ...insertion.mapping };
  delete mapping['extra-id'];
  useEditorStore.getState().insertExcelRows({ ...insertion, mapping });
  expect(getTable().rows[2].cells.map((cell) => cell.text)).toEqual([
    rows[0].total, rows[0].quantity, '13', rows[0].name, 'шт.', rows[0].price
  ]);
});

test.each([1, 3])('inserts into an available %s-column table', (columnCount) => {
  const project = structuredClone(useEditorStore.getState().project);
  const table = project.pages[0].elements.find((element) => element.type === 'table')!;
  table.columns = table.columns.slice(0, columnCount);
  table.rows = table.rows.map((row) => ({ ...row, cells: row.cells.slice(0, columnCount) }));
  useEditorStore.setState({ project });
  const mapping: ExcelTableInsertion['mapping'] = Object.fromEntries(
    table.columns.map((id) => [id, { source: 'name' as const }])
  );
  useEditorStore.getState().insertExcelRows({ ...insertion, mapping });
  expect(getTable().rows[2].cells.map((cell) => cell.text)).toEqual(Array<string>(columnCount).fill(rows[0].name));
});

test('numbering includes the first row when headers are disabled and continues across insertions', () => {
  const project = structuredClone(useEditorStore.getState().project);
  const table = project.pages[0].elements.find((element) => element.type === 'table')!;
  table.firstRowHeader = false;
  table.rows[0].cells[3].text = '20';
  useEditorStore.setState({ project });
  useEditorStore.getState().insertExcelRows(insertion);
  expect(getTable().rows.slice(2).map((row) => row.cells[3].text)).toEqual(['21', '22']);
  useEditorStore.getState().insertExcelRows({ ...insertion, rows: [rows[0]] });
  expect(getTable().rows[4].cells[3].text).toBe('23');
});

test.each([Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER])(
  'rejects number overflow from %s before appending any row or measured height',
  (lastNumber) => {
    const project = structuredClone(useEditorStore.getState().project);
    const table = project.pages[0].elements.find((element) => element.type === 'table')!;
    table.rows[1].cells[3].text = String(lastNumber);
    useEditorStore.setState({ project });
    const before = useEditorStore.getState();
    expect(() => before.insertExcelRows({
      ...insertion, rows: rows.map((row) => ({ ...row, rowHeightPx: 72 }))
    })).toThrow();
    expect(useEditorStore.getState()).toBe(before);
    expect(useEditorStore.getState().project).toBe(project);
    expect(getTable().rows).toHaveLength(2);
    expect(getTable().style.rowHeights).toEqual({ 'existing-row': 60 });
  }
);

test('large batches use unique IDs and table base row height', () => {
  useEditorStore.getState().insertExcelRows({ ...insertion, rows: Array.from({ length: 100 }, () => rows[0]) });
  const table = getTable();
  expect(table.rows).toHaveLength(102);
  const ids = table.rows.flatMap((row) => [row.id, ...row.cells.map((cell) => cell.id)]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(table.rect.height).toBeGreaterThan(900);
});

test('preserves measured row heights through undo and redo', () => {
  const before = getTable();
  useEditorStore.getState().insertExcelRows({
    ...insertion,
    rows: [{ ...rows[0], rowHeightPx: 72 }, { ...rows[1], rowHeightPx: 54 }]
  });
  const table = getTable();
  expect(table.style.rowHeights).toEqual({
    'existing-row': 60, [table.rows[2].id]: 72, [table.rows[3].id]: 54
  });
  useEditorStore.getState().undo();
  expect(getTable()).toEqual(before);
  useEditorStore.getState().redo();
  expect(getTable()).toEqual(table);
});

test('rejects an out-of-range measured height without inserting earlier rows', () => {
  const before = useEditorStore.getState();
  expect(() => before.insertExcelRows({
    ...insertion, rows: [{ ...rows[0], rowHeightPx: 72 }, { ...rows[1], rowHeightPx: 97 }]
  })).toThrow('Высота импортированной строки');
  expect(useEditorStore.getState()).toBe(before);
});
