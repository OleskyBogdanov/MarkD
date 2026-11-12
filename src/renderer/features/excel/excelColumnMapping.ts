import type { KpTableElement } from '@/renderer/domain/model';
import type { ExcelFillRow, ExcelTableColumn } from './excelTableFill';

export const excelColumnSources = ['skip', 'number', 'name', 'unit', 'price', 'quantity', 'total'] as const;
export type ExcelColumnSource = typeof excelColumnSources[number];
export type ExcelColumnAssignment =
  | { source: Exclude<ExcelColumnSource, 'unit'> }
  | { source: 'unit'; value: string };
export type TableColumnMapping = Record<string, ExcelColumnAssignment>;

const normalizeHeading = (label: string): string => label.trim().toLocaleLowerCase('ru-RU')
  .replace(/(?:[,\s]+(?:руб\.?|р\.?)|\s*₽)$/u, '')
  .replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

export const suggestExcelColumnMapping = (columns: readonly ExcelTableColumn[]): TableColumnMapping => {
  const aliases: Record<Exclude<ExcelColumnSource, 'skip'>, readonly string[]> = {
    number: ['№', '№ п/п', '№п/п', 'п/п', 'номер'],
    name: ['наименование', 'наименование товара', 'название'],
    unit: ['ед', 'ед изм', 'едизм', 'единица измерения', 'ед измерения'],
    price: ['цена', 'цена за единицу'],
    quantity: ['количество', 'кол-во', 'кол во'],
    total: ['сумма', 'стоимость', 'итого']
  };
  return Object.fromEntries(columns.map(column => {
    const heading = normalizeHeading(column.label);
    const source = excelColumnSources.find(candidate =>
      candidate !== 'skip' && aliases[candidate].includes(heading)) ?? 'skip';
    return [column.id, source === 'unit' ? { source, value: 'шт.' } : { source }];
  }));
};

export const validateExcelColumnMapping = (columns: readonly string[], mapping: TableColumnMapping): void => {
  const entries = Object.entries(mapping);
  if (entries.length !== columns.length || entries.some(([id]) => !columns.includes(id))) {
    throw new Error('Настройки должны соответствовать колонкам выбранной таблицы');
  }
  for (const column of columns) {
    const assignment = mapping[column];
    if (!assignment || !excelColumnSources.includes(assignment.source)) {
      throw new Error('Выберите значение для каждой колонки таблицы');
    }
    if (assignment.source === 'unit' &&
      (typeof assignment.value !== 'string' || !assignment.value.trim() || assignment.value.trim().length > 64)) {
      throw new Error('Укажите единицу измерения: от 1 до 64 символов');
    }
  }
  if (entries.every(([, assignment]) => assignment.source === 'skip')) {
    throw new Error('Настройте заполнение хотя бы одной колонки');
  }
};

// Preview, measurement and insertion must project the same destination cells.
export const getExcelRowCells = (
  table: KpTableElement,
  mapping: TableColumnMapping,
  rows: readonly ExcelFillRow[]
): readonly (readonly string[])[] => {
  validateExcelColumnMapping(table.columns, mapping);
  const starts = table.columns.map((id, columnIndex) => {
    if (mapping[id].source !== 'number') return 0;
    let maximum = 0;
    for (const row of table.rows.slice(table.firstRowHeader ? 1 : 0)) {
      const text = row.cells[columnIndex].text.trim();
      if (!/^\d+$/.test(text)) continue;
      const number = Number(text);
      if (!Number.isSafeInteger(number)) throw new Error('Номер позиции превышает допустимое значение');
      maximum = Math.max(maximum, number);
    }
    if (!Number.isSafeInteger(maximum + rows.length)) {
      throw new Error('Нумерация позиций превышает допустимое значение');
    }
    return maximum;
  });
  return rows.map((row, rowIndex) => table.columns.map((id, columnIndex) => {
    const assignment = mapping[id];
    if (assignment.source === 'skip') return '';
    if (assignment.source === 'unit') return assignment.value.trim();
    if (assignment.source === 'number') return String(starts[columnIndex] + rowIndex + 1);
    return row[assignment.source];
  }));
};
