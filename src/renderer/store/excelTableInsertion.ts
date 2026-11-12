import { nanoid } from 'nanoid';
import type { KpTableElement } from '@/renderer/domain/model';
import {
  excelTableStructureIssue,
  type ExcelFillRow
} from '@/renderer/features/excel/excelTableFill';
import { getExcelRowCells, type TableColumnMapping } from '@/renderer/features/excel/excelColumnMapping';

export type ExcelTableInsertion = {
  sessionId: number;
  pageId: string;
  tableId: string;
  mapping: TableColumnMapping;
  rows: readonly ExcelFillRow[];
};

export const appendExcelTableRows = (
  table: KpTableElement,
  mapping: TableColumnMapping,
  rows: readonly ExcelFillRow[]
): void => {
  const issue = excelTableStructureIssue(table);
  if (issue) throw new Error(issue);
  if (!rows.length) throw new Error('Выберите позиции для вставки');
  const fields = ['name', 'price', 'quantity', 'total'] as const;
  if (rows.some((row) => fields.some((key) => typeof row[key] !== 'string' || !row[key].trim()))) {
    throw new Error('Все четыре значения позиции должны быть заполнены');
  }
  if (rows.some(row => row.rowHeightPx !== undefined &&
    (!Number.isFinite(row.rowHeightPx) || row.rowHeightPx < 24 || row.rowHeightPx > 96))) {
    throw new Error('Высота импортированной строки должна быть от 24 до 96 px');
  }
  const widths = table.rows[0].cells.map((cell) => cell.widthMm);
  const cells = getExcelRowCells(table, mapping, rows);
  const additions = cells.map((values) => ({
    id: `row_${nanoid(12)}`,
    cells: values.map((text, index) => ({
      id: `cell_${nanoid(12)}`,
      text,
      widthMm: widths[index]
    }))
  }));
  additions.forEach((addition, index) => {
    const height = rows[index].rowHeightPx;
    if (height !== undefined) table.style.rowHeights[addition.id] = height;
  });
  table.rows.push(...additions);
};
