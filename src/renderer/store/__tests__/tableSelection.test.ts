import { beforeEach, describe, expect, test } from 'vitest';
import { migrateProject, serializeProject, type KpTableElement } from '@/renderer/domain/model';
import { selectedTableCells, type TableRangeSelection } from '@/renderer/domain/tableSelection';
import { resolveTableCellAlign, resolveTableCellStyle, resolveTableCellVerticalAlign } from '@/renderer/domain/tableStyle';
import { useEditorStore } from '../useEditorStore';

const store = () => useEditorStore.getState();
const table = (): KpTableElement => {
  const element = store().project.pages[0].elements.find((item) => item.type === 'table');
  if (!element || element.type !== 'table') throw new Error('Missing table');
  return element;
};
const pageId = () => store().project.pages[0].id;
const selectRange = (kind: TableRangeSelection['kind'], fromRow: number, fromColumn: number, toRow: number, toColumn: number): void => {
  const current = table();
  store().select({
    type: 'element', pageId: pageId(), elementId: current.id,
    tableRange: {
      kind,
      anchor: { rowId: current.rows[fromRow].id, columnId: current.columns[fromColumn] },
      focus: { rowId: current.rows[toRow].id, columnId: current.columns[toColumn] }
    }
  });
};

describe('table selection and cell formatting', () => {
  beforeEach(() => {
    store().resetProject('blank');
    store().addTable(pageId());
    store().addTableRow(pageId(), table().id);
    store().addTableRow(pageId(), table().id);
  });

  test('resolves reversed rectangles, row bands, and column bands', () => {
    const current = table();
    const anchor = { rowId: current.rows[2].id, columnId: current.columns[1] };
    const focus = { rowId: current.rows[0].id, columnId: current.columns[0] };
    expect(selectedTableCells(current, { kind: 'cells', anchor, focus })).toHaveLength(6);
    expect(selectedTableCells(current, { kind: 'rows', anchor, focus })).toHaveLength(3 * current.columns.length);
    expect(selectedTableCells(current, { kind: 'columns', anchor, focus })).toHaveLength(current.rows.length * 2);
    expect(selectedTableCells(current, { kind: 'cells', anchor, focus: { ...focus, rowId: 'missing' } })).toEqual([]);
  });

  test('formats selected rows in one history increment and preserves other cells', () => {
    selectRange('rows', 1, 0, 2, 0);
    const before = store().undoStack.length;
    store().updateTableSelectionStyle(pageId(), table().id, { fontSize: 19, backgroundColor: '#123456', bold: true });
    expect(store().undoStack).toHaveLength(before + 1);
    expect(table().rows[0].cells.every((cell) => !cell.style)).toBe(true);
    for (const row of table().rows.slice(1, 3)) for (const cell of row.cells) {
      expect(cell.style).toEqual({ fontSize: 19, backgroundColor: '#123456', bold: true });
    }
    store().undo();
    expect(table().rows[1].cells[0].style).toBeUndefined();
    store().redo();
    expect(table().rows[1].cells[0].style?.fontSize).toBe(19);
  });

  test('applies each formatting action separately, without cell-by-cell history or time grouping', () => {
    selectRange('columns', 0, 0, 0, 1);
    const before = store().undoStack.length;
    store().updateTableSelectionStyle(pageId(), table().id, { align: 'center' });
    store().updateTableSelectionStyle(pageId(), table().id, { align: 'right' });
    expect(store().undoStack).toHaveLength(before + 2);
    store().undo();
    expect(table().rows[0].cells[0].style?.align).toBe('center');
    selectRange('columns', 0, 0, 0, 1);
    store().updateTableSelectionStyle(pageId(), table().id, { align: 'center' });
    expect(store().undoStack).toHaveLength(before + 1);
  });

  test('new row and column formatting obey last action while untouched legacy cells preserve row priority', () => {
    const original = table();
    store().updateTableColumnAlign(pageId(), original.id, original.columns[0], 'center');
    store().updateTableRowAlign(pageId(), original.id, original.rows[1].id, 'right');
    store().updateTableRowVerticalAlign(pageId(), original.id, original.rows[1].id, 'bottom');
    expect(resolveTableCellAlign(table(), original.rows[1].id, original.columns[0])).toBe('right');
    selectRange('columns', 0, 0, 0, 0);
    store().updateTableSelectionStyle(pageId(), original.id, { align: 'left', verticalAlign: 'top' });
    expect(resolveTableCellAlign(table(), original.rows[1].id, original.columns[0])).toBe('left');
    expect(resolveTableCellVerticalAlign(table(), original.rows[1].id, original.columns[0])).toBe('top');
    expect(resolveTableCellAlign(table(), original.rows[1].id, original.columns[1])).toBe('right');
    selectRange('rows', 1, 0, 1, 0);
    store().updateTableSelectionStyle(pageId(), original.id, { align: 'center' });
    expect(resolveTableCellAlign(table(), original.rows[1].id, original.columns[0])).toBe('center');
    expect(resolveTableCellAlign(table(), original.rows[0].id, original.columns[0])).toBe('left');
  });

  test('single-cell editing selection formats only that cell', () => {
    const original = table();
    store().select({ type: 'element', pageId: pageId(), elementId: original.id, tableCell: { rowId: original.rows[1].id, columnId: original.columns[0] } });
    store().updateTableSelectionStyle(pageId(), original.id, { italic: true, textColor: '#ff0000' });
    expect(table().rows[1].cells[0].style).toEqual({ italic: true, textColor: '#ff0000' });
    expect(table().rows[1].cells[1].style).toBeUndefined();
    expect(table().style.textColor).toBe(original.style.textColor);
  });

  test('whole-table formatting includes headers and overrides earlier local formatting', () => {
    selectRange('rows', 1, 0, 1, 0);
    store().updateTableSelectionStyle(pageId(), table().id, { align: 'right' });
    store().select({ type: 'element', pageId: pageId(), elementId: table().id });
    store().updateTableSelectionStyle(pageId(), table().id, { align: 'center', textColor: '#123456' });
    expect(table().rows.flatMap((row) => row.cells).every((cell) => cell.style?.align === 'center' && cell.style.textColor === '#123456')).toBe(true);
    expect(table().style.align).toBe('center');
  });

  test('cell styles survive serialization, reopening, duplication, and stable-ID reorder', () => {
    selectRange('cells', 1, 0, 1, 0);
    const cellId = table().rows[1].cells[0].id;
    const rowId = table().rows[1].id;
    const columnId = table().columns[0];
    store().updateTableSelectionStyle(pageId(), table().id, { fontSize: 17, borderStyle: 'dotted', borderVisible: false });
    const serialized = serializeProject(store().project);
    const reopened = migrateProject(JSON.parse(serialized));
    expect(reopened.schemaVersion).toBe(4);
    store().setProject(reopened);
    store().moveTableRow(pageId(), table().id, rowId, 1);
    store().moveTableColumn(pageId(), table().id, columnId, 1);
    expect(table().rows.flatMap((row) => row.cells).find((cell) => cell.id === cellId)?.style).toEqual({ fontSize: 17, borderStyle: 'dotted', borderVisible: false });
    store().select({ type: 'element', pageId: pageId(), elementId: table().id });
    store().duplicateSelected();
    const copies = store().project.pages[0].elements.filter((element) => element.type === 'table');
    expect(copies).toHaveLength(2);
    expect(copies[1].rows.flatMap((row) => row.cells).find((cell) => cell.id === cellId)?.style?.fontSize).toBe(17);
    store().deleteTableRow(pageId(), copies[1].id, rowId);
    expect(store().project.pages[0].elements.find((element) => element.id === copies[1].id)).not.toEqual(copies[1]);
    expect(table().rows.flatMap((row) => row.cells).find((cell) => cell.id === cellId)?.style?.fontSize).toBe(17);
  });

  test('selected row height updates only touched rows and creates one history increment', () => {
    selectRange('cells', 1, 0, 2, 1);
    const before = store().undoStack.length;
    store().updateTableSelectionRowHeight(pageId(), table().id, 60);
    expect(store().undoStack).toHaveLength(before + 1);
    expect(table().style.rowHeights[table().rows[0].id]).toBeUndefined();
    expect(table().style.rowHeights[table().rows[1].id]).toBe(60);
    expect(table().style.rowHeights[table().rows[2].id]).toBe(60);
    store().select({ type: 'element', pageId: pageId(), elementId: table().id });
    store().updateTableSelectionRowHeight(pageId(), table().id, 50);
    expect(table().style.rowHeight).toBe(50);
    expect(table().style.rowHeights).toEqual({});
    store().addTableRow(pageId(), table().id);
    expect(table().style.rowHeights[table().rows.at(-1)!.id]).toBeUndefined();
  });

  test('deleting a selection endpoint clears to whole-table selection without dangling styles', () => {
    selectRange('columns', 0, 0, 0, 1);
    store().updateTableSelectionStyle(pageId(), table().id, { fontSize: 20 });
    store().deleteTableColumn(pageId(), table().id, table().columns[0]);
    expect(store().selected).toEqual({ type: 'element', pageId: pageId(), elementId: table().id });
    expect(table().rows[0].cells[0].style?.fontSize).toBe(20);
    store().undo();
    expect(table().rows[0].cells[0].style?.fontSize).toBe(20);
  });

  test('old documents retain sparse absence and existing header/alternating defaults', () => {
    const original = table();
    const reopened = migrateProject(JSON.parse(serializeProject(store().project)));
    const oldTable = reopened.pages[0].elements.find((element) => element.type === 'table');
    if (!oldTable || oldTable.type !== 'table') throw new Error('Missing table');
    expect(oldTable.rows[0].cells[0].style).toBeUndefined();
    expect(resolveTableCellStyle(oldTable, original.rows[0].id, original.columns[0])).toMatchObject({
      textColor: original.style.headerRowTextColor, bold: true, fontSize: original.style.fontSize
    });
  });
});
