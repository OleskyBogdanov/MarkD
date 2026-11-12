import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '../useEditorStore';

const store = () => useEditorStore.getState();
const page = () => store().project.pages[0];
const element = (type: KpElement['type']) => {
  const result = page().elements.find((item) => item.type === type);
  if (!result) throw new Error(`Missing ${type}`);
  return result;
};
const table = () => {
  const result = element('table');
  if (result.type !== 'table') throw new Error('Missing table');
  return result;
};
const asset = { id: 'history-asset', name: 'sample.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };

beforeEach(() => {
  store().resetProject('blank');
  store().addText(page().id);
  store().addTextField(page().id);
  store().addSelectField(page().id);
  store().addShape(page().id, 'rectangle');
  store().addTable(page().id);
  store().addAsset(asset);
  store().setProject(store().project);
  // Keep consecutive actions within the grouping window without timing races.
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
});
afterEach(() => vi.restoreAllMocks());

describe('history boundaries', () => {
  test.each(['textField', 'selectField'] as const)('%s distinct nested style properties are distinct steps', (kind) => {
    const id = element(kind).id;
    const update = kind === 'textField' ? store().updateTextField : store().updateSelectField;
    const before = structuredClone(store().project);
    update(page().id, id, { style: { fontSize: 20 } });
    const middle = structuredClone(store().project);
    update(page().id, id, { style: { borderRadius: 15 } });
    const after = structuredClone(store().project);
    expect(store().undoStack).toHaveLength(2);
    store().undo();
    expect(store().project).toEqual(middle);
    store().undo();
    expect(store().project).toEqual(before);
    store().redo();
    expect(store().project).toEqual(middle);
    store().redo();
    expect(store().project).toEqual(after);
  });
  test.each(['text', 'shape', 'table'] as const)('%s distinct formatting properties remain separate steps', (kind) => {
    const before = structuredClone(store().project);
    const id = element(kind).id;
    const first = () => {
      if (kind === 'text') store().updateTextStyle(page().id, id, { bold: true });
      else if (kind === 'shape') store().updateShape(page().id, id, { textStyle: { bold: true } });
      else store().updateTableStyle(page().id, id, { fontSize: 20 });
    };
    const second = () => {
      if (kind === 'text') store().updateTextStyle(page().id, id, { italic: true });
      else if (kind === 'shape') store().updateShape(page().id, id, { textStyle: { italic: true } });
      else store().updateTableStyle(page().id, id, { textColor: '#123456' });
    };
    first();
    const middle = structuredClone(store().project);
    second();
    const after = structuredClone(store().project);
    expect(store().undoStack).toHaveLength(2);
    store().undo();
    expect(store().project).toEqual(middle);
    store().undo();
    expect(store().project).toEqual(before);
    store().redo();
    expect(store().project).toEqual(middle);
    store().redo();
    expect(store().project).toEqual(after);
  });
  test('a new mutation after undo invalidates the abandoned redo branch', () => {
    const before = store().project;
    const savedBefore = structuredClone(before);
    store().updateText(page().id, element('text').id, 'Abandoned branch');
    const abandoned = store().project;
    const savedAbandoned = structuredClone(abandoned);
    store().undo();
    expect(store().project).toEqual(savedBefore);
    expect(store().redoStack).toHaveLength(1);
    store().updateText(page().id, element('text').id, 'Replacement branch');
    const replacement = structuredClone(store().project);
    expect(store().redoStack).toEqual([]);
    store().redo();
    expect(store().project).toEqual(replacement);
    store().undo();
    expect(store().project).toEqual(savedBefore);
    store().redo();
    expect(store().project).toEqual(replacement);
    expect(before).toEqual(savedBefore);
    expect(abandoned).toEqual(savedAbandoned);
  });
});

describe('no-ops preserve document, history, revision, and redo branch', () => {
  const cases: [string, () => void][] = [
    ['same title', () => store().updateProjectTitle(store().project.metadata.title)],
    ['empty title', () => store().updateProjectTitle('  ')],
    ['same text', () => {
      const current = element('text');
      if (current.type === 'text') store().updateText(page().id, current.id, current.text);
    }],
    ['same text style', () => store().updateTextStyle(page().id, element('text').id, {})],
    ['same field', () => store().updateTextField(page().id, element('textField').id, {})],
    ['same select', () => store().updateSelectField(page().id, element('selectField').id, {})],
    ['same shape', () => store().updateShape(page().id, element('shape').id, {})],
    ['same rect', () => store().updateElementRect(page().id, element('text').id, element('text').rect)],
    ['same background', () => store().updatePageBackground(page().id, page().background)],
    ['same table style', () => store().updateTableStyle(page().id, table().id, {})],
    ['same table settings', () => store().updateTableSettings(page().id, table().id, { firstRowHeader: table().firstRowHeader })],
    ['same column width', () => store().updateTableColumnWidth(page().id, table().id, table().columns[0], table().rows[0].cells[0].widthMm)],
    ['same row height', () => store().updateTableRowHeight(page().id, table().id, table().rows[0].id, table().style.rowHeight)],
    ['clear absent alignment', () => store().resetTableAlignment(page().id, table().id, { type: 'row', id: table().rows[0].id })],
    ['selection style without selection', () => store().updateTableSelectionStyle(page().id, table().id, { bold: true })],
    ['selection height without selection', () => store().updateTableSelectionRowHeight(page().id, table().id, 80)],
    ['missing page add', () => store().addText('missing')],
    ['missing page duplicate', () => store().duplicatePage('missing')],
    ['missing element delete', () => store().deleteElement(page().id, 'missing')],
    ['missing row delete', () => store().deleteTableRow(page().id, table().id, 'missing')],
    ['missing column delete', () => store().deleteTableColumn(page().id, table().id, 'missing')],
    ['missing option delete', () => store().deleteSelectOption(page().id, element('selectField').id, 'missing')],
    ['duplicate asset ID', () => store().addAsset(asset)],
    ['page reorder to self', () => store().movePage(0, 0)],
    ['page reorder past edge', () => store().movePage(0, 99)],
    ['last page delete', () => store().deletePage(page().id)],
    ['row reorder past edge', () => store().moveTableRow(page().id, table().id, table().rows[0].id, -1)],
    ['column reorder past edge', () => store().moveTableColumn(page().id, table().id, table().columns[0], -1)],
    ['last layer delete', () => store().deleteLayer(store().activeLayerId)],
    ['layer reorder past edge', () => store().reorderLayer(store().activeLayerId, -1)],
    ['same layer name', () => store().renameLayer(store().activeLayerId, store().project.layers[0].name)],
    ['same layer visibility', () => store().setLayerVisibility(store().activeLayerId, true)],
    ['same layer lock', () => store().setLayerLocked(store().activeLayerId, false)],
    ['same element layer', () => store().moveElementToLayer(page().id, element('text').id, element('text').layerId)],
    ['delete without selection', () => store().deleteSelected()],
    ['duplicate without selection', () => store().duplicateSelected()],
    ['UI selection', () => store().select({ type: 'element', pageId: page().id, elementId: element('text').id })],
    ['UI zoom', () => store().setZoom(1.5)],
    ['UI active page', () => store().setActivePage(page().id)],
    ['UI active layer', () => store().setActiveLayer(store().activeLayerId)]
  ];
  test.each(cases)('%s', (_name, mutate) => {
    store().updateProjectTitle('Pending redo branch');
    store().undo();
    const before = store();
    const saved = structuredClone(before.project);
    mutate();
    expect(store().project).toEqual(saved);
    expect(store().undoStack).toEqual(before.undoStack);
    expect(store().redoStack).toEqual(before.redoStack);
    expect(store().revision).toBe(before.revision);
    expect(store().isDirty).toBe(before.isDirty);
    expect(before.project).toEqual(saved);
  });
  test('undo and redo on empty stacks do nothing', () => {
    const before = store();
    store().undo();
    store().redo();
    expect(store()).toBe(before);
  });
});
