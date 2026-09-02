import type { KpTableElement, TextAlign, VerticalAlign } from './model';

export const resolveTableCellAlign = (element: KpTableElement, rowId: string, columnId: string): TextAlign =>
  element.style.rowAlign[rowId] ?? element.style.columnAlign[columnId] ?? element.style.align;

export const resolveTableCellVerticalAlign = (
  element: KpTableElement,
  rowId: string,
  columnId: string
): VerticalAlign =>
  element.style.rowVerticalAlign[rowId] ??
  element.style.columnVerticalAlign[columnId] ??
  element.style.verticalAlign;

export const resolveTableRowHeight = (element: KpTableElement, rowId: string): number =>
  element.style.rowHeights[rowId] ?? element.style.rowHeight;
