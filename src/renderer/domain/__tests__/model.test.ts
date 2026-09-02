import { describe, expect, test } from 'vitest';
import {
  calculateTableHeightMm,
  calculateTableRowsHeightMm,
  iconNameSchema,
  migrateProject,
  mmToPx,
  pxToMm,
  projectSchema,
  schemaVersion,
  serializeProject,
  shapeElementSchema,
  textAlignSchema,
  textFieldElementSchema,
  selectFieldElementSchema,
  tableSchema
} from '@/renderer/domain/model';
import { resolveTableCellVerticalAlign, resolveTableRowHeight } from '@/renderer/domain/tableStyle';

describe('единицы измерения', () => {
  test('px/mm обратимы для A4 масштаба 1', () => {
    const px = mmToPx(210);
    const mm = pxToMm(px);
    expect(Math.abs(mm - 210)).toBeLessThan(0.0001);
  });

  test('A4 ширина в мм корректна', () => {
    expect(mmToPx(210)).toBeCloseTo((210 * 96) / 25.4, 4);
  });

  test('высота таблицы растёт предсказуемо с каждой строкой', () => {
    expect(calculateTableHeightMm(3, 1)).toBe(20);
    expect(calculateTableHeightMm(3, 4)).toBe(47);
    expect(calculateTableHeightMm(3, 1, false)).toBe(13);
    expect(calculateTableHeightMm(3, 2, true, 68)).toBe(47);
    expect(calculateTableRowsHeightMm([34, 68])).toBe(38);
  });
});

describe('схема проекта', () => {
  test('принимает корректный минимальный проект', () => {
    const now = new Date().toISOString();
    const parsed = projectSchema.parse({
      schemaVersion,
      metadata: { id: 'project-test', title: 'KP', createdAt: now, updatedAt: now },
      orientation: 'portrait',
      layers: [{ id: 'layer_main', name: 'Основной', order: 0, visible: true, locked: false }],
      pages: [
        {
          id: 'p1',
          widthMm: 210,
          heightMm: 297,
          background: null,
          elements: [
            {
              id: 'e1',
              type: 'text',
              rect: { x: 10, y: 10, width: 20, height: 10 },
              text: 'Проверка',
              style: {
                fontId: 'inter',
                fontSize: 12,
                bold: false,
                italic: false,
                align: 'left',
                color: '#23241f'
              },
              layerId: 'layer_main',
              zIndex: 0
            }
          ],
          flowStartYmm: 8
        }
      ],
      assets: [],
      styles: {}
    });

    expect(parsed.pages).toHaveLength(1);
  });

  test('валидирует textField, selectField, иконки и выравнивание', () => {
    const field = textFieldElementSchema.parse({
      id: 'field-1',
      type: 'textField',
      rect: { x: 10, y: 20, width: 80, height: 20 },
      label: 'Телефон',
      value: '+7 900 000-00-00',
      placeholder: 'Введите телефон',
      iconName: 'phone',
      textAlign: 'right',
      verticalAlign: 'bottom',
      style: {},
      zIndex: 1
    });
    const select = selectFieldElementSchema.parse({
      id: 'select-1',
      type: 'selectField',
      rect: { x: 10, y: 45, width: 80, height: 20 },
      label: 'Тариф',
      placeholder: 'Выберите тариф',
      options: [{ id: 'stable-option-id', label: 'Премиум' }],
      selectedOptionId: 'stable-option-id',
      style: {},
      zIndex: 2
    });

    expect(field.iconName).toBe('phone');
    expect(field.textAlign).toBe('right');
    expect(field.verticalAlign).toBe('bottom');
    expect(field).toMatchObject({
      showLabel: true,
      showPlaceholder: true,
      style: {
        iconColor: '#1e5b49',
        backgroundTransparent: false,
        borderVisible: true
      }
    });
    expect(select.options[0].id).toBe('stable-option-id');
    expect(['left', 'center', 'right'].map((align) => textAlignSchema.parse(align))).toEqual(['left', 'center', 'right']);
    expect(() => iconNameSchema.parse('unknown-icon')).toThrow();
  });

  test('добавляет среднее вертикальное выравнивание старому textField', () => {
    const field = textFieldElementSchema.parse({
      id: 'field-without-vertical-align',
      type: 'textField',
      rect: { x: 10, y: 20, width: 80, height: 20 },
      label: 'Контакт',
      value: 'Мария',
      placeholder: '',
      textAlign: 'left',
      style: {},
      zIndex: 1
    });

    expect(field.verticalAlign).toBe('middle');
  });

  test('добавляет совместимые значения настроек старой таблице', () => {
    const table = tableSchema.parse({
      id: 'table-legacy',
      type: 'table',
      rect: { x: 10, y: 10, width: 100, height: 20 },
      columns: ['column-1'],
      rows: [{ id: 'row-1', cells: [{ id: 'cell-1', text: 'Заголовок', widthMm: 35 }] }],
      pageHeader: 'Позиции',
      style: {},
      zIndex: 0
    });

    expect(table).toMatchObject({
      showPageHeader: true,
      firstRowHeader: true,
      style: {
        rowHeight: 34,
        cellPadding: 7,
        fontSize: 11,
        borderVisible: true,
        borderWidth: 1,
        borderStyle: 'solid',
        verticalAlign: 'middle',
        wrapText: true,
        alternatingRows: false,
        columnVerticalAlign: {},
        rowVerticalAlign: {},
        rowHeights: {}
      }
    });
  });

  test('применяет высоту строки и вертикальное выравнивание по приоритету', () => {
    const table = tableSchema.parse({
      id: 'table-alignment',
      type: 'table',
      rect: { x: 10, y: 10, width: 100, height: 30 },
      columns: ['column-1'],
      rows: [{ id: 'row-1', cells: [{ id: 'cell-1', text: 'Текст', widthMm: 35 }] }],
      style: {
        verticalAlign: 'middle',
        columnVerticalAlign: { 'column-1': 'bottom' },
        rowVerticalAlign: { 'row-1': 'top' },
        rowHeights: { 'row-1': 58 }
      },
      zIndex: 0
    });

    expect(resolveTableCellVerticalAlign(table, 'row-1', 'column-1')).toBe('top');
    expect(resolveTableRowHeight(table, 'row-1')).toBe(58);
  });

  test('валидирует базовую фигуру и её оформление', () => {
    const shape = shapeElementSchema.parse({
      id: 'shape-1',
      type: 'shape',
      shape: 'triangle',
      rect: { x: 60, y: 100, width: 80, height: 60 },
      style: {
        fillColor: '#dde9e3',
        fillTransparent: false,
        strokeColor: '#1e5b49',
        strokeWidth: 2,
        strokeStyle: 'dashed'
      },
      layerId: 'layer_main',
      zIndex: 2
    });

    expect(shape).toMatchObject({
      shape: 'triangle',
      text: '',
      style: { strokeStyle: 'dashed', strokeWidth: 2, cornerRadius: 0 },
      textStyle: { fontSize: 12, align: 'center', color: '#23241f' }
    });
  });

  test('мигрирует документ v1 и повторно открывает сериализованный v4', () => {
    const legacy = {
      schemaVersion: 1,
      metadata: { title: 'Старое КП' },
      orientation: 'portrait',
      pages: [{
        id: 'legacy-page',
        widthMm: 210,
        heightMm: 297,
        background: null,
        flowStartYmm: 8,
        elements: [{
          id: 'legacy-text',
          type: 'text',
          rect: { x: 10, y: 10, width: 100, height: 20 },
          text: 'Старый документ',
          style: { fontFamily: 'Arial', fontSize: 12, bold: false, italic: false, align: 'center' },
          zIndex: 0
        }]
      }],
      assets: [],
      styles: {}
    } as const;

    const migrated = migrateProject(legacy);
    expect(migrated.schemaVersion).toBe(schemaVersion);
    expect(migrated.layers).toEqual([{ id: 'layer_main', name: 'Основной', order: 0, visible: true, locked: false }]);
    expect(migrated.pages[0].elements[0]).toMatchObject({ layerId: 'layer_main', style: { color: '#23241f', fontId: 'noto-sans' } });
    expect(migrated.pages[0].elements[0]).toMatchObject({ type: 'text', text: 'Старый документ' });
    expect(migrateProject(JSON.parse(serializeProject(migrated)))).toEqual(migrated);
  });

  test('мигрирует документ v2 с полями и таблицей', () => {
    const migrated = migrateProject({
      schemaVersion: 2,
      metadata: { title: 'Версия 2' },
      orientation: 'portrait',
      pages: [{
        id: 'p1', widthMm: 210, heightMm: 297, background: null, flowStartYmm: 8,
        elements: [{
          id: 'table1', type: 'table', rect: { x: 10, y: 10, width: 100, height: 20 },
          columns: ['c1'], rows: [{ id: 'r1', cells: [{ id: 'cell1', text: 'Значение', widthMm: 35 }] }],
          pageHeader: 'Таблица', zIndex: 0
        }]
      }],
      assets: [], styles: {}
    });
    const table = migrated.pages[0].elements[0];
    expect(table).toMatchObject({ type: 'table', layerId: 'layer_main' });
    if (table.type !== 'table') throw new Error('Таблица не мигрирована');
    expect(table.style).toMatchObject({ textColor: '#23241f', align: 'left', fontId: 'inter' });
  });

  test('мигрирует системные шрифты документа v3 в переносимые идентификаторы', () => {
    const now = new Date().toISOString();
    const migrated = migrateProject({
      schemaVersion: 3,
      metadata: { id: 'project-v3', title: 'Версия 3', createdAt: now, updatedAt: now },
      orientation: 'portrait',
      layers: [{ id: 'layer_main', name: 'Основной', order: 0, visible: true, locked: false }],
      pages: [{
        id: 'p1', widthMm: 210, heightMm: 297, background: null, flowStartYmm: 8,
        elements: [{
          id: 'text1', type: 'text', rect: { x: 10, y: 10, width: 100, height: 20 }, text: 'Текст',
          style: { fontFamily: 'Georgia, Times New Roman, serif', fontSize: 14, bold: false, italic: false, align: 'left', color: '#23241f' },
          layerId: 'layer_main', zIndex: 0
        }]
      }],
      assets: [], styles: {}
    });

    expect(migrated.metadata.renderProfileVersion).toBe(1);
    expect(migrated.pages[0].elements[0]).toMatchObject({ type: 'text', style: { fontId: 'pt-serif' } });
  });
});
