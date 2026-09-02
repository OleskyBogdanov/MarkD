import { beforeEach, describe, expect, test } from 'vitest';
import { migrateProject, projectSchema, serializeProject } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';

describe('editor store: новые элементы и история', () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
  });

  test('добавляет и редактирует textField с undo/redo', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    useEditorStore.getState().addTextField(pageId);

    const added = useEditorStore.getState().project.pages[0].elements.find((element) => element.type === 'textField');
    expect(added?.type).toBe('textField');
    expect(useEditorStore.getState().isDirty).toBe(true);
    if (!added || added.type !== 'textField') throw new Error('textField не добавлен');

    useEditorStore.getState().updateTextField(pageId, added.id, {
      label: 'Email клиента',
      value: 'sales@example.com',
      placeholder: 'name@example.com',
      iconName: 'mail',
      textAlign: 'right'
    });
    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id);
    expect(updated).toMatchObject({ label: 'Email клиента', value: 'sales@example.com', iconName: 'mail', textAlign: 'right' });

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({ label: 'Контактное лицо', textAlign: 'left' });
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({ label: 'Email клиента', textAlign: 'right' });
  });

  test('управляет устойчивыми options selectField через историю', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    useEditorStore.getState().addSelectField(pageId);
    const select = useEditorStore.getState().project.pages[0].elements.find((element) => element.type === 'selectField');
    if (!select || select.type !== 'selectField') throw new Error('selectField не добавлен');
    const originalIds = select.options.map((option) => option.id);

    useEditorStore.getState().addSelectOption(pageId, select.id);
    const afterAdd = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === select.id);
    if (!afterAdd || afterAdd.type !== 'selectField') throw new Error('selectField потерян');
    expect(afterAdd.options.slice(0, 2).map((option) => option.id)).toEqual(originalIds);
    expect(afterAdd.options).toHaveLength(3);

    const addedOption = afterAdd.options[2];
    useEditorStore.getState().updateSelectOption(pageId, select.id, addedOption.id, 'Очень длинный вариант тарифа');
    useEditorStore.getState().updateSelectField(pageId, select.id, { selectedOptionId: addedOption.id });
    expect(projectSchema.parse(useEditorStore.getState().project)).toBeTruthy();

    useEditorStore.getState().undo();
    const afterUndo = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === select.id);
    expect(afterUndo).toMatchObject({ selectedOptionId: null });
  });

  test('сериализует и повторно открывает проект с новыми элементами', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    useEditorStore.getState().addTextField(pageId);
    useEditorStore.getState().addSelectField(pageId);
    useEditorStore.getState().addTable(pageId);
    const snapshot = serializeProject(useEditorStore.getState().project);
    const reopened = migrateProject(JSON.parse(snapshot));

    useEditorStore.getState().setProject(reopened);
    expect(useEditorStore.getState().project.pages[0].elements.filter((element) => element.type === 'textField')).toHaveLength(1);
    expect(useEditorStore.getState().project.pages[0].elements.filter((element) => element.type === 'selectField')).toHaveLength(1);
    expect(useEditorStore.getState().project.pages[0].elements.filter((element) => element.type === 'table')).toHaveLength(2);
    expect(useEditorStore.getState().isDirty).toBe(false);
  });

  test('размещает новые нетабличные элементы без взаимного наложения', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    useEditorStore.getState().addTextField(pageId);
    useEditorStore.getState().addSelectField(pageId);
    useEditorStore.getState().addText(pageId);
    const elements = useEditorStore.getState().project.pages[0].elements.filter((element) => element.type !== 'table');
    const overlaps = (a: (typeof elements)[number], b: (typeof elements)[number]): boolean =>
      a.rect.x < b.rect.x + b.rect.width &&
      a.rect.x + a.rect.width > b.rect.x &&
      a.rect.y < b.rect.y + b.rect.height &&
      a.rect.y + a.rect.height > b.rect.y;

    for (let first = 0; first < elements.length; first += 1) {
      for (let second = first + 1; second < elements.length; second += 1) {
        expect(overlaps(elements[first], elements[second])).toBe(false);
      }
    }
  });

  test('изолирует редактирование активным слоем и переносит элементы', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    const mainLayerId = useEditorStore.getState().activeLayerId;
    useEditorStore.getState().addLayer();
    const secondLayerId = useEditorStore.getState().activeLayerId;
    useEditorStore.getState().addText(pageId);
    const added = useEditorStore.getState().project.pages[0].elements.at(-1);
    if (!added || added.type !== 'text') throw new Error('Текст не добавлен');
    expect(added.layerId).toBe(secondLayerId);

    useEditorStore.getState().setActiveLayer(mainLayerId);
    useEditorStore.getState().updateText(pageId, added.id, 'Чужое изменение');
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({ text: 'Новый текст' });

    useEditorStore.getState().setActiveLayer(secondLayerId);
    useEditorStore.getState().moveElementToLayer(pageId, added.id, mainLayerId);
    expect(useEditorStore.getState().activeLayerId).toBe(mainLayerId);
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({ layerId: mainLayerId });
  });

  test('сохраняет цвета и выравнивание таблицы по строке и колонке', () => {
    const state = useEditorStore.getState();
    const pageId = state.project.pages[0].id;
    const table = state.project.pages[0].elements.find((element) => element.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Таблица не найдена');
    const rowId = table.rows[0].id;
    const columnId = table.columns[0];

    state.updateTableStyle(pageId, table.id, { textColor: '#112233', backgroundColor: '#f0f0f0', align: 'right' });
    useEditorStore.getState().updateTableColumnAlign(pageId, table.id, columnId, 'center');
    useEditorStore.getState().updateTableRowAlign(pageId, table.id, rowId, 'left');

    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    expect(updated).toMatchObject({ style: { textColor: '#112233', backgroundColor: '#f0f0f0', align: 'right' } });
    if (!updated || updated.type !== 'table') throw new Error('Таблица потеряна');
    expect(updated.style.columnAlign[columnId]).toBe('center');
    expect(updated.style.rowAlign[rowId]).toBe('left');
    expect(projectSchema.parse(useEditorStore.getState().project)).toBeTruthy();
  });

  test('настраивает структуру, размеры и оформление таблицы с undo', () => {
    const state = useEditorStore.getState();
    const pageId = state.project.pages[0].id;
    const table = state.project.pages[0].elements.find((element) => element.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Таблица не найдена');
    const originalHeight = table.rect.height;
    const firstColumnId = table.columns[0];
    const firstRowId = table.rows[0].id;

    state.updateTableSettings(pageId, table.id, { showPageHeader: false, firstRowHeader: false });
    useEditorStore.getState().updateTableStyle(pageId, table.id, {
      rowHeight: 48,
      cellPadding: 12,
      fontSize: 14,
      borderStyle: 'dashed',
      alternatingRows: true,
      verticalAlign: 'bottom'
    });
    useEditorStore.getState().addTableRow(pageId, table.id);
    useEditorStore.getState().updateTableColumnWidth(pageId, table.id, firstColumnId, 92);
    useEditorStore.getState().moveTableColumn(pageId, table.id, firstColumnId, 1);
    useEditorStore.getState().moveTableRow(pageId, table.id, firstRowId, 1);

    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    if (!updated || updated.type !== 'table') throw new Error('Таблица потеряна');
    expect(updated.showPageHeader).toBe(false);
    expect(updated.firstRowHeader).toBe(false);
    expect(updated.style).toMatchObject({ rowHeight: 48, cellPadding: 12, fontSize: 14, borderStyle: 'dashed', alternatingRows: true, verticalAlign: 'bottom' });
    expect(updated.rect.height).not.toBe(originalHeight);
    expect(updated.columns[1]).toBe(firstColumnId);
    expect(updated.rows[1].id).toBe(firstRowId);
    expect(updated.rows.every((row) => row.cells[1].widthMm === 92)).toBe(true);
    expect(projectSchema.parse(useEditorStore.getState().project)).toBeTruthy();

    useEditorStore.getState().undo();
    const afterUndo = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    if (!afterUndo || afterUndo.type !== 'table') throw new Error('Таблица потеряна после undo');
    expect(afterUndo.rows[0].id).toBe(firstRowId);
  });
});
