import type { KpTableCell, KpTableElement } from './model';

export type TableCellStyle = NonNullable<KpTableCell['style']>;
export type TableCellPosition = { rowId: string; columnId: string };
export type TableRangeSelection = {
  kind: 'cells' | 'rows' | 'columns';
  anchor: TableCellPosition;
  focus: TableCellPosition;
};

export const selectedTableCells = (table: KpTableElement, range?: TableRangeSelection, cell?: TableCellPosition): KpTableCell[] => {
  if (!range) {
    if (!cell) return table.rows.flatMap((row) => row.cells);
    return table.rows.find((row) => row.id === cell.rowId)?.cells.filter((_, index) => table.columns[index] === cell.columnId) ?? [];
  }
  const rows = [range.anchor.rowId, range.focus.rowId].map((id) => table.rows.findIndex((row) => row.id === id));
  const columns = [range.anchor.columnId, range.focus.columnId].map((id) => table.columns.indexOf(id));
  if (rows.includes(-1) || columns.includes(-1)) return [];
  return table.rows.flatMap((row, rowIndex) => {
    if (range.kind !== 'columns' && (rowIndex < Math.min(...rows) || rowIndex > Math.max(...rows))) return [];
    return row.cells.filter((_, columnIndex) => range.kind === 'rows' || (columnIndex >= Math.min(...columns) && columnIndex <= Math.max(...columns)));
  });
};
