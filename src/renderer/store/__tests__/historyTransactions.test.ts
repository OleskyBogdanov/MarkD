import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '../useEditorStore';
import { insertImageWithAsset } from '../historyTransaction';

const store = () => useEditorStore.getState();
const page = () => store().project.pages[0];
const element = (type: KpElement['type']) => {
  const result = page().elements.find((item) => item.type === type);
  if (!result) throw new Error(`Missing ${type}`);
  return result;
};
let now = 1_000;

beforeEach(() => {
  store().resetProject('blank');
  store().addText(page().id);
  store().addTextField(page().id);
  store().addSelectField(page().id);
  store().addShape(page().id, 'rectangle');
  store().addTable(page().id);
  store().setProject(store().project);
  now = 1_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('explicit history transactions', () => {
  test('multiple mutations more than one second apart form one immutable undo step', () => {
    const before = store().project;
    const savedBefore = structuredClone(before);
    const text = element('text');
    store().beginHistoryTransaction();
    store().updateElementRect(page().id, text.id, { ...text.rect, x: 10 });
    const intermediate = store().project;
    const savedIntermediate = structuredClone(intermediate);
    now += 5_000;
    store().updateText(page().id, text.id, 'Long gesture');
    now += 5_000;
    store().updateElementRect(page().id, text.id, { ...text.rect, x: 20 });
    store().endHistoryTransaction();
    const after = store().project;
    const savedAfter = structuredClone(after);
    expect(store().historyTransaction).toBeNull();
    expect(store().undoStack).toHaveLength(1);
    expect(before).toEqual(savedBefore);
    expect(intermediate).toEqual(savedIntermediate);
    store().undo();
    expect(store().project).toEqual(savedBefore);
    store().redo();
    expect(store().project).toEqual(savedAfter);
    expect(after).toEqual(savedAfter);
    expect(before).toEqual(savedBefore);
  });
  test('separate transactions less than one second apart remain separate undo steps', () => {
    const text = element('text');
    const before = structuredClone(store().project);
    store().beginHistoryTransaction();
    store().updateElementRect(page().id, text.id, { ...text.rect, x: 10 });
    store().endHistoryTransaction();
    const middle = structuredClone(store().project);
    now += 10;
    store().beginHistoryTransaction();
    store().updateElementRect(page().id, text.id, { ...text.rect, x: 20 });
    store().endHistoryTransaction();
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
  test('an empty transaction preserves a pending redo branch and revision', () => {
    store().updateProjectTitle('Pending redo');
    store().undo();
    const before = store();
    store().beginHistoryTransaction();
    now += 5_000;
    store().updateTextStyle(page().id, element('text').id, {});
    store().endHistoryTransaction();
    expect(store().historyTransaction).toBeNull();
    expect(store().project).toEqual(before.project);
    expect(store().undoStack).toEqual(before.undoStack);
    expect(store().redoStack).toEqual(before.redoStack);
    expect(store().revision).toBe(before.revision);
    expect(store().isDirty).toBe(before.isDirty);
    store().redo();
    expect(store().project.metadata.title).toBe('Pending redo');
  });
  test('asset registration and image placement undo as one transaction with stable image and asset IDs', () => {
    const before = structuredClone(store().project);
    const asset = { id: 'transaction-image', name: 'image.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };
    insertImageWithAsset({ pageId: page().id, asset });
    const after = structuredClone(store().project);
    const image = element('image');
    expect(store().undoStack).toHaveLength(1);
    expect(image).toMatchObject({ assetId: asset.id });
    store().undo();
    expect(store().project).toEqual(before);
    store().redo();
    expect(store().project).toEqual(after);
    expect(element('image').id).toBe(image.id);
  });
  test.each(['locked', 'hidden', 'missing-page'] as const)('image insertion into %s destination preserves document and history', (reason) => {
    if (reason === 'locked') store().setLayerLocked(store().activeLayerId, true);
    if (reason === 'hidden') store().setLayerVisibility(store().activeLayerId, false);
    const before = store();
    insertImageWithAsset({
      pageId: reason === 'missing-page' ? 'missing' : page().id,
      asset: { id: 'rejected-image', name: 'image.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
    });
    expect(store().project).toEqual(before.project);
    expect(store().undoStack).toEqual(before.undoStack);
    expect(store().revision).toBe(before.revision);
    expect(store().historyTransaction).toBeNull();
  });
  test('deleting several elements forms one transaction', () => {
    const before = structuredClone(store().project);
    const ids = page().elements.slice(0, 3).map((item) => item.id);
    store().beginHistoryTransaction();
    ids.forEach((id) => store().deleteElement(page().id, id));
    store().endHistoryTransaction();
    const after = structuredClone(store().project);
    expect(store().undoStack).toHaveLength(1);
    store().undo();
    expect(store().project).toEqual(before);
    store().redo();
    expect(store().project).toEqual(after);
  });
  test('endHistoryGroup separates consecutive typing even within the time window', () => {
    const id = element('text').id;
    const before = structuredClone(store().project);
    store().updateText(page().id, id, 'First');
    store().updateText(page().id, id, 'First phrase');
    const middle = structuredClone(store().project);
    store().endHistoryGroup();
    now += 10;
    store().updateText(page().id, id, 'Second phrase');
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
});

describe('formatting actions do not use timed typing groups', () => {
  test.each(['text', 'textField', 'selectField', 'shape', 'table'] as const)('%s repeated formatting is independently undoable', (kind) => {
    const id = element(kind).id;
    const update = (fontSize: number): void => {
      switch (kind) {
        case 'text': store().updateTextStyle(page().id, id, { fontSize }); break;
        case 'textField': store().updateTextField(page().id, id, { style: { fontSize } }); break;
        case 'selectField': store().updateSelectField(page().id, id, { style: { fontSize } }); break;
        case 'shape': store().updateShape(page().id, id, { textStyle: { fontSize } }); break;
        case 'table': store().updateTableStyle(page().id, id, { fontSize }); break;
      }
    };
    const before = structuredClone(store().project);
    update(20);
    const middle = structuredClone(store().project);
    now += 10;
    update(24);
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
});
