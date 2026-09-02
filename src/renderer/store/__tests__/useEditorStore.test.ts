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
      textAlign: 'right',
      verticalAlign: 'bottom'
    });
    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id);
    expect(updated).toMatchObject({
      label: 'Email клиента',
      value: 'sales@example.com',
      iconName: 'mail',
      textAlign: 'right',
      verticalAlign: 'bottom'
    });

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({
      label: 'Контактное лицо',
      textAlign: 'left',
      verticalAlign: 'middle'
    });
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === added.id)).toMatchObject({
      label: 'Email клиента',
      textAlign: 'right',
      verticalAlign: 'bottom'
    });
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

  test('размещает новые элементы в центральной зоне листа', () => {
    const pageId = useEditorStore.getState().project.pages[0].id;
    useEditorStore.getState().addTextField(pageId);
    useEditorStore.getState().addSelectField(pageId);
    useEditorStore.getState().addText(pageId);
    useEditorStore.getState().addTable(pageId);
    const page = useEditorStore.getState().project.pages[0];
    const added = page.elements.slice(-4);

    added.forEach((element) => {
      const centerX = element.rect.x + element.rect.width / 2;
      const centerY = element.rect.y + element.rect.height / 2;
      expect(Math.abs(centerX - page.widthMm / 2)).toBeLessThanOrEqual(52);
      expect(Math.abs(centerY - page.heightMm / 2)).toBeLessThanOrEqual(75);
    });
  });

  test('добавляет и оформляет базовую фигуру с undo', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    state.addShape(page.id, 'ellipse');

    const shape = useEditorStore.getState().project.pages[0].elements.at(-1);
    if (!shape || shape.type !== 'shape') throw new Error('Фигура не добавлена');
    expect(shape.shape).toBe('ellipse');

    useEditorStore.getState().updateShape(page.id, shape.id, {
      shape: 'triangle',
      style: { fillColor: '#112233', strokeColor: '#445566', strokeStyle: 'dotted', strokeWidth: 3 }
    });
    expect(useEditorStore.getState().project.pages[0].elements.at(-1)).toMatchObject({
      type: 'shape',
      shape: 'triangle',
      style: { fillColor: '#112233', strokeColor: '#445566', strokeStyle: 'dotted', strokeWidth: 3 }
    });

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.pages[0].elements.at(-1)).toMatchObject({ type: 'shape', shape: 'ellipse' });
  });

  test('добавляет текст и скругление прямоугольнику с undo и redo', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    state.addShape(page.id, 'rectangle');

    const shape = useEditorStore.getState().project.pages[0].elements.at(-1);
    if (!shape || shape.type !== 'shape') throw new Error('Фигура не добавлена');
    expect(shape).toMatchObject({
      text: '',
      style: { cornerRadius: 0 },
      textStyle: { align: 'center', bold: false, italic: false }
    });

    useEditorStore.getState().updateShape(page.id, shape.id, {
      text: 'Важное условие',
      style: { cornerRadius: 18 },
      textStyle: {
        fontId: 'pt-serif',
        fontSize: 22,
        bold: true,
        italic: true,
        align: 'right',
        color: '#112233'
      }
    });

    expect(useEditorStore.getState().project.pages[0].elements.at(-1)).toMatchObject({
      text: 'Важное условие',
      style: { cornerRadius: 18 },
      textStyle: { fontId: 'pt-serif', fontSize: 22, bold: true, italic: true, align: 'right', color: '#112233' }
    });
    expect(projectSchema.parse(useEditorStore.getState().project)).toBeTruthy();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.pages[0].elements.at(-1)).toMatchObject({ text: '', style: { cornerRadius: 0 } });
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project.pages[0].elements.at(-1)).toMatchObject({ text: 'Важное условие', style: { cornerRadius: 18 } });
  });

  test('объединяет последовательный набор текста в одну операцию истории', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    const text = page.elements.find((element) => element.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Текст не найден');
    const historyBefore = state.undoStack.length;

    state.updateText(page.id, text.id, 'П');
    useEditorStore.getState().updateText(page.id, text.id, 'Пр');
    useEditorStore.getState().updateText(page.id, text.id, 'При');

    expect(useEditorStore.getState().undoStack).toHaveLength(historyBefore + 1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.pages[0].elements.find((element) => element.id === text.id)).toMatchObject({
      text: text.text
    });
  });

  test('позволяет растянуть изображение на весь лист', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    state.addAsset({
      id: 'asset_full_page',
      name: 'background.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AA=='
    });
    state.addImage(page.id, 'asset_full_page');

    const image = useEditorStore.getState().project.pages[0].elements.find((element) => element.type === 'image');
    if (!image || image.type !== 'image') throw new Error('Изображение не добавлено');

    useEditorStore.getState().updateElementRect(page.id, image.id, {
      x: 0,
      y: 0,
      width: page.widthMm + 50,
      height: page.heightMm + 50
    });

    const resized = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === image.id);
    expect(resized?.rect).toEqual({ x: 0, y: 0, width: page.widthMm, height: page.heightMm });
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

  test('перемещает элемент на передний и задний план внутри слоя', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    const [text, table] = page.elements;

    state.setElementStackPosition(page.id, text.id, 'front');
    const afterFront = useEditorStore.getState().project.pages[0].elements;
    expect(afterFront.find((element) => element.id === text.id)?.zIndex).toBeGreaterThan(
      afterFront.find((element) => element.id === table.id)?.zIndex ?? -1
    );

    useEditorStore.getState().setElementStackPosition(page.id, text.id, 'back');
    const afterBack = useEditorStore.getState().project.pages[0].elements;
    expect(afterBack.find((element) => element.id === text.id)?.zIndex).toBeLessThan(
      afterBack.find((element) => element.id === table.id)?.zIndex ?? Number.MAX_SAFE_INTEGER
    );

    useEditorStore.getState().undo();
    const afterUndo = useEditorStore.getState().project.pages[0].elements;
    expect(afterUndo.find((element) => element.id === text.id)?.zIndex).toBeGreaterThan(
      afterUndo.find((element) => element.id === table.id)?.zIndex ?? -1
    );
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
    useEditorStore.getState().updateTableColumnVerticalAlign(pageId, table.id, columnId, 'bottom');
    useEditorStore.getState().updateTableRowVerticalAlign(pageId, table.id, rowId, 'top');

    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    expect(updated).toMatchObject({ style: { textColor: '#112233', backgroundColor: '#f0f0f0', align: 'right' } });
    if (!updated || updated.type !== 'table') throw new Error('Таблица потеряна');
    expect(updated.style.columnAlign[columnId]).toBe('center');
    expect(updated.style.rowAlign[rowId]).toBe('left');
    expect(updated.style.columnVerticalAlign[columnId]).toBe('bottom');
    expect(updated.style.rowVerticalAlign[rowId]).toBe('top');
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

  test('изменяет ширину и высоту таблицы через геометрию элемента', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    const table = page.elements.find((element) => element.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Таблица не найдена');
    const originalRect = { ...table.rect };
    const originalRowHeight = table.style.rowHeight;

    state.updateElementRect(page.id, table.id, {
      ...table.rect,
      width: table.rect.width - 24,
      height: table.rect.height + 18
    });

    const resized = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    if (!resized || resized.type !== 'table') throw new Error('Таблица потеряна');
    expect(resized.rect.width).toBe(originalRect.width - 24);
    expect(resized.rect.height).toBeGreaterThan(originalRect.height);
    expect(resized.style.rowHeights[table.rows[0].id]).toBeGreaterThan(originalRowHeight);

    useEditorStore.getState().undo();
    const restored = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    expect(restored?.rect).toEqual(originalRect);
  });

  test('изменяет границу колонок и высоту шапки с undo', () => {
    const state = useEditorStore.getState();
    const page = state.project.pages[0];
    const table = page.elements.find((element) => element.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Таблица не найдена');
    const firstColumnId = table.columns[0];
    const firstRowId = table.rows[0].id;
    const pairWidth = table.rows[0].cells[0].widthMm + table.rows[0].cells[1].widthMm;
    const originalHeight = table.rect.height;

    state.resizeTableColumnBoundary(page.id, table.id, firstColumnId, 80);
    useEditorStore.getState().updateTableRowHeight(page.id, table.id, firstRowId, 60);

    const updated = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    if (!updated || updated.type !== 'table') throw new Error('Таблица потеряна');
    expect(updated.rows[0].cells[0].widthMm).toBe(80);
    expect(updated.rows[0].cells[0].widthMm + updated.rows[0].cells[1].widthMm).toBe(pairWidth);
    expect(updated.style.rowHeights[firstRowId]).toBe(60);
    expect(updated.rect.height).toBeGreaterThan(originalHeight);
    expect(projectSchema.parse(useEditorStore.getState().project)).toBeTruthy();

    useEditorStore.getState().undo();
    const afterUndo = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
    if (!afterUndo || afterUndo.type !== 'table') throw new Error('Таблица потеряна после undo');
    expect(afterUndo.style.rowHeights[firstRowId]).toBeUndefined();
  });
});
