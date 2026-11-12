import type { ExcelCatalogSheet } from '@/shared/excelCatalog';
import type { KpProject, KpTableElement } from '@/renderer/domain/model';

export type ExcelProductChoice = {
  productId: string;
  variant: 'open' | 'enclosed';
  withAvr: boolean;
  quantity: number;
};

export type ExcelFillRow = { name: string; price: string; quantity: string; total: string; rowHeightPx?: number };
export type ExcelTableColumn = { id: string; label: string };
export type ExcelTableTarget = {
  pageId: string;
  tableId: string;
  layerId: string;
  label: string;
  unavailableReason: string | null;
  columns: ExcelTableColumn[];
  table: KpTableElement;
};

const normalizeSpaces = (text: string): string => text.trim().replace(/\s+/g, ' ');

const requireMoney = (value: number | null, label: string): number => {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}: в прайсе нет корректной цены`);
  }
  return value;
};

export const formatExcelMoney = (kopecks: number): string => {
  requireMoney(kopecks, 'Цена');
  const rubles = Math.floor(kopecks / 100).toLocaleString('ru-RU');
  const remainder = kopecks % 100;
  return remainder ? `${rubles},${String(remainder).padStart(2, '0')}` : rubles;
};

export const prepareExcelRows = (
  sheet: ExcelCatalogSheet,
  choices: readonly ExcelProductChoice[]
): readonly ExcelFillRow[] => {
  const selected = new Map(choices.map((choice) => [choice.productId, choice]));
  if (selected.size !== choices.length) throw new Error('Одна позиция выбрана несколько раз');
  for (const choice of choices) {
    if (!sheet.products.some((product) => product.id === choice.productId)) {
      throw new Error('Выбранная позиция отсутствует в прайсе');
    }
  }
  return sheet.products.filter((product) => selected.has(product.id)).map((product) => {
    const choice = selected.get(product.id)!;
    const label = `Строка ${product.sourceRow}`;
    const model = normalizeSpaces(product.model);
    const engineBrand = normalizeSpaces(product.engineBrand);
    const engineModel = normalizeSpaces(product.engineModel);
    if (!model || !engineBrand || !engineModel) {
      throw new Error(`${label}: заполните модель, марку и модель двигателя`);
    }
    if (choice.variant !== 'open' && choice.variant !== 'enclosed') {
      throw new Error(`${label}: выберите исполнение ДГУ`);
    }
    if (!Number.isSafeInteger(choice.quantity) || choice.quantity <= 0) {
      throw new Error(`${label}: количество должно быть положительным целым числом`);
    }
    const base = requireMoney(
      choice.variant === 'open' ? product.openPriceKopecks : product.enclosedPriceKopecks,
      label
    );
    const price = base + (choice.withAvr ? requireMoney(product.avrPriceKopecks, `${label}, АВР`) : 0);
    const total = price * choice.quantity;
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(total)) {
      throw new Error(`${label}: цена или сумма превышает допустимое значение`);
    }
    return {
      name: `Дизельный генератор ${model}${choice.variant === 'enclosed' ? ' в шумозащитном евро кожухе' : ''}${choice.withAvr ? ' с АВР' : ''} ${engineBrand} (${engineModel})`,
      price: `${formatExcelMoney(price)} р.`,
      quantity: String(choice.quantity),
      total: `${formatExcelMoney(total)} р.`
    };
  });
};

export const excelTableStructureIssue = (table: KpTableElement): string | null => {
  if (!table.columns.length) return 'Добавьте в таблицу хотя бы одну колонку';
  if (new Set(table.columns).size !== table.columns.length || table.columns.some((id) => !id)) {
    return 'Идентификаторы колонок таблицы должны быть уникальными';
  }
  if (!table.rows.length || table.rows.some((row) => row.cells.length !== table.columns.length)) {
    return 'Количество ячеек в строках не соответствует колонкам таблицы';
  }
  return null;
};

export const getExcelTableTargets = (project: KpProject): ExcelTableTarget[] =>
  project.pages.flatMap((page, pageIndex) => {
    const tables = page.elements.filter((element): element is KpTableElement => element.type === 'table');
    return tables.map((table, index) => {
      const layer = project.layers.find((candidate) => candidate.id === table.layerId);
      const unavailableReason = !layer ? 'Слой таблицы не найден'
        : !layer.visible ? 'Слой таблицы скрыт'
          : layer.locked ? 'Слой таблицы заблокирован'
            : excelTableStructureIssue(table);
      return {
        pageId: page.id,
        tableId: table.id,
        layerId: table.layerId,
        table,
        label: `Страница ${pageIndex + 1} · ${table.pageHeader || 'Таблица'}${tables.filter((candidate) => candidate.pageHeader === table.pageHeader).length > 1 ? ` (${index + 1})` : ''}`,
        unavailableReason,
        columns: table.columns.map((id, columnIndex) => ({
          id,
          label: (table.firstRowHeader ? normalizeSpaces(table.rows[0]?.cells[columnIndex]?.text ?? '') : '')
            || `Колонка ${columnIndex + 1}`
        }))
      };
    });
  });
