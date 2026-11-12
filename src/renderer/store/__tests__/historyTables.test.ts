import { beforeEach, describe, expect, test } from 'vitest';
import type { KpTableElement } from '@/renderer/domain/model';
import { useEditorStore } from '../useEditorStore';

const store = () => useEditorStore.getState();
const pageId = () => store().project.pages[0].id;
const table = (): KpTableElement => {
  const result = store().project.pages[0].elements[0];
  if (result.type !== 'table') throw new Error('Missing table');
  return result;
};
const rowId = () => table().rows[0].id;
const columnId = () => table().columns[0];
const roundTrip = (mutate: () => void): void => {
  const before = store().project;
  const savedBefore = structuredClone(before);
  const historyLength = store().undoStack.length;
  mutate();
  const after = store().project;
  const savedAfter = structuredClone(after);
  expect(after).not.toEqual(savedBefore);
  expect(before).toEqual(savedBefore);
  expect(store().undoStack).toHaveLength(historyLength + 1);
  expect(store().undoStack.at(-1)).toEqual(savedBefore);
  store().undo();
  expect(store().project).toEqual(savedBefore);
  expect(after).toEqual(savedAfter);
  store().redo();
  expect(store().project).toEqual(savedAfter);
  store().updateTableCell(pageId(), table().id, rowId(), columnId(), 'Later edit');
  expect(before).toEqual(savedBefore);
  expect(after).toEqual(savedAfter);
};

beforeEach(() => {
  store().resetProject('blank');
  store().addTable(pageId());
  store().addTableRow(pageId(), table().id);
  store().addTableRow(pageId(), table().id);
  store().updateTableCell(pageId(), table().id, rowId(), columnId(), 'Stable cell payload');
  store().setProject(store().project);
});

describe('table document mutations restore complete snapshots', () => {
  const cases: [string, () => void][] = [
    ['add row', () => store().addTableRow(pageId(), table().id)],
    ['add column', () => store().addTableColumn(pageId(), table().id)],
    ['delete row', () => store().deleteTableRow(pageId(), table().id, rowId())],
    ['delete column', () => store().deleteTableColumn(pageId(), table().id, columnId())],
    ['move row forward', () => store().moveTableRow(pageId(), table().id, rowId(), 1)],
    ['move row backward', () => store().moveTableRow(pageId(), table().id, table().rows[1].id, -1)],
    ['move column forward', () => store().moveTableColumn(pageId(), table().id, columnId(), 1)],
    ['move column backward', () => store().moveTableColumn(pageId(), table().id, table().columns[1], -1)],
    ['column width', () => store().updateTableColumnWidth(pageId(), table().id, columnId(), 42)],
    ['column boundary', () => store().resizeTableColumnBoundary(pageId(), table().id, columnId(), 42)],
    ['row height', () => store().updateTableRowHeight(pageId(), table().id, rowId(), 70)],
    ['column alignment', () => store().updateTableColumnAlign(pageId(), table().id, columnId(), 'right')],
    ['row alignment', () => store().updateTableRowAlign(pageId(), table().id, rowId(), 'center')],
    ['column vertical alignment', () => store().updateTableColumnVerticalAlign(pageId(), table().id, columnId(), 'bottom')],
    ['row vertical alignment', () => store().updateTableRowVerticalAlign(pageId(), table().id, rowId(), 'top')],
    ['page header setting', () => store().updateTableSettings(pageId(), table().id, { showPageHeader: !table().showPageHeader })],
    ['first row header setting', () => store().updateTableSettings(pageId(), table().id, { firstRowHeader: !table().firstRowHeader })],
    ['header text', () => store().updateTableHeader(pageId(), table().id, 'Persistent header')],
    ['cell text', () => store().updateTableCell(pageId(), table().id, rowId(), columnId(), 'New cell payload')],
    ['table appearance', () => store().updateTableStyle(pageId(), table().id, { fontSize: 18, textColor: '#123456' })],
    ['table default height', () => store().updateTableStyle(pageId(), table().id, { rowHeight: 65 })]
  ];
  test.each(cases)('%s', (_name, mutate) => roundTrip(mutate));

  test.each(['row', 'column'] as const)('reset %s alignment', (type) => {
    const id = type === 'row' ? rowId() : columnId();
    if (type === 'row') {
      store().updateTableRowAlign(pageId(), table().id, id, 'right');
      store().updateTableRowVerticalAlign(pageId(), table().id, id, 'bottom');
    } else {
      store().updateTableColumnAlign(pageId(), table().id, id, 'right');
      store().updateTableColumnVerticalAlign(pageId(), table().id, id, 'bottom');
    }
    roundTrip(() => store().resetTableAlignment(pageId(), table().id, { type, id }));
  });
  test.each(['row', 'column', 'rowVertical', 'columnVertical'] as const)('clear %s override', (target) => {
    const state = store();
    const id = table().id;
    const actions = {
      row: () => state.updateTableRowAlign(pageId(), id, rowId(), 'center'),
      column: () => state.updateTableColumnAlign(pageId(), id, columnId(), 'center'),
      rowVertical: () => state.updateTableRowVerticalAlign(pageId(), id, rowId(), 'bottom'),
      columnVertical: () => state.updateTableColumnVerticalAlign(pageId(), id, columnId(), 'bottom')
    };
    actions[target]();
    roundTrip(() => {
      switch (target) {
        case 'row': state.updateTableRowAlign(pageId(), id, rowId(), null); break;
        case 'column': state.updateTableColumnAlign(pageId(), id, columnId(), null); break;
        case 'rowVertical': state.updateTableRowVerticalAlign(pageId(), id, rowId(), null); break;
        case 'columnVertical': state.updateTableColumnVerticalAlign(pageId(), id, columnId(), null); break;
      }
    });
  });
});

describe('selection formatting restores stable cells and row metadata', () => {
  test.each(['table', 'cell', 'cells', 'rows', 'columns'] as const)('%s style and height', (kind) => {
    const current = table();
    const anchor = { rowId: current.rows[0].id, columnId: current.columns[0] };
    const focus = { rowId: current.rows[1].id, columnId: current.columns[1] };
    const selection = {
      type: 'element' as const, pageId: pageId(), elementId: current.id,
      ...(kind === 'cell' ? { tableCell: anchor } : {}),
      ...(kind === 'cells' || kind === 'rows' || kind === 'columns' ? { tableRange: { kind, anchor, focus } } : {})
    };
    store().select(selection);
    roundTrip(() => store().updateTableSelectionStyle(pageId(), current.id, { bold: true, backgroundColor: '#123456' }));
    store().select(selection);
    roundTrip(() => store().updateTableSelectionRowHeight(pageId(), current.id, 80));
  });
  test('distinct selection targets and formatting properties are separate undo steps', () => {
    const before = structuredClone(store().project);
    const current = table();
    store().select({
      type: 'element', pageId: pageId(), elementId: current.id,
      tableCell: { rowId: current.rows[0].id, columnId: current.columns[0] }
    });
    store().updateTableSelectionStyle(pageId(), current.id, { bold: true });
    const middle = structuredClone(store().project);
    store().select({
      type: 'element', pageId: pageId(), elementId: current.id,
      tableCell: { rowId: current.rows[1].id, columnId: current.columns[1] }
    });
    store().updateTableSelectionStyle(pageId(), current.id, { italic: true });
    const after = structuredClone(store().project);
    expect(store().undoStack).toHaveLength(2);
    store().undo();
    expect(store().project).toEqual(middle);
    store().undo();
    expect(store().project).toEqual(before);
    store().redo();
    expect(store().project).toEqual(middle);
    store().redo();
    expect(store().project).toEqual(after);
  });
});
