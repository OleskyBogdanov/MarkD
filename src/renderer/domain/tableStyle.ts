import type { KpTableElement, TextAlign, VerticalAlign } from './model';
import type { TableCellStyle } from './tableSelection';

const cellStyle = (element: KpTableElement, rowId: string, columnId: string): TableCellStyle | undefined =>
  element.rows.find((row) => row.id === rowId)?.cells[element.columns.indexOf(columnId)]?.style;

export const resolveTableCellAlign = (element: KpTableElement, rowId: string, columnId: string): TextAlign =>
  cellStyle(element, rowId, columnId)?.align ?? element.style.rowAlign[rowId] ?? element.style.columnAlign[columnId] ?? element.style.align;

export const resolveTableCellVerticalAlign = (
  element: KpTableElement,
  rowId: string,
  columnId: string
): VerticalAlign =>
  cellStyle(element, rowId, columnId)?.verticalAlign ??
  element.style.rowVerticalAlign[rowId] ??
  element.style.columnVerticalAlign[columnId] ??
  element.style.verticalAlign;

export const resolveTableRowHeight = (element: KpTableElement, rowId: string): number =>
  element.style.rowHeights[rowId] ?? element.style.rowHeight;

export const resolveTableCellStyle = (element: KpTableElement, rowId: string, columnId: string): Required<TableCellStyle> => {
  const rowIndex = element.rows.findIndex((row) => row.id === rowId);
  const header = element.firstRowHeader && rowIndex === 0;
  const bodyIndex = rowIndex - (element.firstRowHeader ? 1 : 0);
  return {
    ...element.style,
    textColor: header ? element.style.headerRowTextColor : element.style.textColor,
    backgroundColor: header ? element.style.headerRowBackgroundColor
      : element.style.alternatingRows && bodyIndex % 2 === 1 ? element.style.alternateRowColor : element.style.backgroundColor,
    bold: header && element.style.headerRowBold,
    italic: false,
    ...cellStyle(element, rowId, columnId),
    align: resolveTableCellAlign(element, rowId, columnId),
    verticalAlign: resolveTableCellVerticalAlign(element, rowId, columnId)
  };
};
