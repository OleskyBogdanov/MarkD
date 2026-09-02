import type { KpTableElement, TextAlign } from './model';

export const resolveTableCellAlign = (element: KpTableElement, rowId: string, columnId: string): TextAlign =>
  element.style.rowAlign[rowId] ?? element.style.columnAlign[columnId] ?? element.style.align;
