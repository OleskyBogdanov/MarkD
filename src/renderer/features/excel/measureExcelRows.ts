import { mmToPx, type KpTableElement } from '@/renderer/domain/model';
import { fontFamilyForId } from '@/renderer/domain/fontRegistry';
import type { ExcelFillRow } from './excelTableFill';
import { getExcelRowCells, type TableColumnMapping } from './excelColumnMapping';

// Persist measured heights with the inserted rows so edit, preview, pagination
// and PDF all use the same geometry, including wrapped generator names.
export const measureExcelRows = (
  table: KpTableElement,
  mapping: TableColumnMapping,
  rows: readonly ExcelFillRow[]
): readonly ExcelFillRow[] => {
  const reference = table.rows[0].cells;
  const cells = getExcelRowCells(table, mapping, rows);
  const totalWidth = reference.reduce((sum, cell) => sum + cell.widthMm, 0);
  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0',
    boxSizing: 'border-box', fontFamily: fontFamilyForId(table.style.fontId),
    fontSize: `${table.style.fontSize}px`, fontWeight: '400', fontStyle: 'normal',
    lineHeight: '1.2', whiteSpace: table.style.wrapText ? 'pre-wrap' : 'pre',
    overflowWrap: 'anywhere', wordBreak: 'break-word', padding: `${table.style.cellPadding}px`
  });
  document.body.append(probe);
  try {
    return rows.map((row, rowIndex) => {
      let height = table.style.rowHeight;
      for (const [columnIndex, text] of cells[rowIndex].entries()) {
        const borderWidth = table.style.borderVisible ? table.style.borderWidth : 0;
        const cellWidth = mmToPx(table.rect.width) * reference[columnIndex].widthMm / totalWidth - borderWidth;
        probe.style.width = `${Math.max(1, cellWidth)}px`;
        probe.textContent = text;
        height = Math.max(height, Math.ceil(probe.getBoundingClientRect().height + borderWidth));
        if (!table.style.wrapText && probe.scrollWidth > probe.clientWidth) {
          throw new Error(`Текст «${row.name}» не помещается в колонку. Включите перенос текста или расширьте колонку.`);
        }
      }
      if (height > 96) {
        throw new Error(`Текст «${row.name}» требует строки выше 96 px. Расширьте колонку или уменьшите шрифт таблицы.`);
      }
      return { ...row, rowHeightPx: height };
    });
  } finally {
    probe.remove();
  }
};
