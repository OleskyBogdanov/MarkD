import { beforeEach, describe, expect, test } from 'vitest';
import type { KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '../useEditorStore';

const store = () => useEditorStore.getState();
const page = () => store().project.pages[0];
const element = (type: KpElement['type']) => {
  const result = page().elements.find((candidate) => candidate.type === type);
  if (!result) throw new Error(`Missing ${type}`);
  return result;
};
const asset = { id: 'history-image', name: 'sample.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' };
const kinds = ['text', 'textField', 'selectField', 'table', 'shape', 'image'] as const;
const add = (kind: typeof kinds[number]): void => {
  const state = store();
  const id = page().id;
  switch (kind) {
    case 'text': state.addText(id); break;
    case 'textField': state.addTextField(id); break;
    case 'selectField': state.addSelectField(id); break;
    case 'table': state.addTable(id); break;
    case 'shape': state.addShape(id, 'rectangle'); break;
    case 'image': state.addImage(id, asset.id); break;
  }
};
const roundTrip = (mutate: () => void): void => {
  const before = store().project;
  const savedBefore = structuredClone(before);
  const historyLength = store().undoStack.length;
  mutate();
  const after = store().project;
  const savedAfter = structuredClone(after);
  expect(after).not.toEqual(savedBefore);
  expect(before).toEqual(savedBefore);
  expect(store().undoStack).toHaveLength(historyLength + 1);
  expect(store().undoStack.at(-1)).toEqual(savedBefore);
  store().undo();
  expect(store().project).toEqual(savedBefore);
  expect(after).toEqual(savedAfter);
  store().redo();
  expect(store().project).toEqual(savedAfter);
  expect(before).toEqual(savedBefore);
  // A later mutation must leave the restored snapshot and its nested data intact.
  store().updateProjectTitle('Snapshot immutability probe');
  expect(after).toEqual(savedAfter);
  expect(before).toEqual(savedBefore);
};

beforeEach(() => {
  store().resetProject('blank');
  store().addAsset(asset);
  kinds.forEach(add);
  store().setProject(store().project);
});

describe('history for every element kind', () => {
  test.each(kinds)('add %s preserves generated identity on redo', (kind) => roundTrip(() => add(kind)));
  test.each(kinds)('move and resize %s', (kind) => roundTrip(() => {
    const current = element(kind);
    store().updateElementRect(page().id, current.id, { ...current.rect, x: 10, y: 12, width: 60 });
  }));
  test.each(kinds)('delete %s directly', (kind) => roundTrip(() => {
    store().deleteElement(page().id, element(kind).id);
  }));
  test.each(kinds)('delete selected %s', (kind) => {
    store().select({ type: 'element', pageId: page().id, elementId: element(kind).id });
    roundTrip(() => store().deleteSelected());
  });
  test.each(kinds)('duplicate selected %s without changing original data', (kind) => {
    const original = structuredClone(element(kind));
    store().select({ type: 'element', pageId: page().id, elementId: original.id });
    roundTrip(() => {
      store().duplicateSelected();
      const copy = page().elements.at(-1);
      if (!copy) throw new Error('Missing duplicated element');
      expect(copy.id).not.toBe(original.id);
      expect({ ...copy, id: original.id, rect: original.rect, zIndex: original.zIndex }).toEqual(original);
    });
  });
  test.each(kinds)('move %s to another layer', (kind) => {
    const originalLayerId = element(kind).layerId;
    store().addLayer();
    const targetId = store().activeLayerId;
    store().setActiveLayer(originalLayerId);
    roundTrip(() => store().moveElementToLayer(page().id, element(kind).id, targetId));
  });
  test.each(['front', 'back'] as const)('set z-order to %s', (position) => {
    const target = position === 'front' ? element('text') : element('image');
    roundTrip(() => store().setElementStackPosition(page().id, target.id, position));
  });
});

describe('history for element content and formatting', () => {
  const cases: [string, () => void][] = [
    ['text content', () => store().updateText(page().id, element('text').id, 'Retained text')],
    ['text style', () => store().updateTextStyle(page().id, element('text').id, { bold: true, color: '#112233' })],
    ['shape geometry kind', () => store().updateShape(page().id, element('shape').id, { shape: 'ellipse' })],
    ['shape content', () => store().updateShape(page().id, element('shape').id, { text: 'Shape caption' })],
    ['shape style', () => store().updateShape(page().id, element('shape').id, { style: { fillColor: '#123456', cornerRadius: 12 } })],
    ['shape text style', () => store().updateShape(page().id, element('shape').id, { textStyle: { italic: true, fontSize: 20 } })],
    ['text field content', () => store().updateTextField(page().id, element('textField').id, {
      label: 'Contact', value: 'Alice', placeholder: 'Name', showLabel: false, showPlaceholder: false,
      iconName: 'mail', textAlign: 'right', verticalAlign: 'bottom'
    })],
    ['text field style', () => store().updateTextField(page().id, element('textField').id, { style: { fontSize: 20, borderRadius: 10 } })],
    ['select field content', () => store().updateSelectField(page().id, element('selectField').id, { label: 'Plan', placeholder: 'Choose' })],
    ['select field style', () => store().updateSelectField(page().id, element('selectField').id, { style: { fontSize: 20, borderVisible: false } })],
    ['select option add', () => store().addSelectOption(page().id, element('selectField').id)],
    ['select option edit', () => {
      const current = element('selectField');
      if (current.type !== 'selectField') throw new Error('Missing select');
      store().updateSelectOption(page().id, current.id, current.options[0].id, 'Retained option');
    }],
    ['select chosen option', () => {
      const current = element('selectField');
      if (current.type !== 'selectField') throw new Error('Missing select');
      store().updateSelectField(page().id, current.id, { selectedOptionId: current.options[1].id });
    }]
  ];
  test.each(cases)('%s', (_name, mutate) => roundTrip(mutate));
  test('deleting the chosen option restores both its identity and selection', () => {
    const current = element('selectField');
    if (current.type !== 'selectField') throw new Error('Missing select');
    const optionId = current.options[0].id;
    store().updateSelectField(page().id, current.id, { selectedOptionId: optionId });
    roundTrip(() => {
      store().deleteSelectOption(page().id, current.id, optionId);
      expect(element('selectField')).toMatchObject({ selectedOptionId: null });
    });
  });
});

describe('history for pages, title, layers, and assets', () => {
  test.each([
    ['add page', () => store().addPage()],
    ['duplicate populated page', () => store().duplicatePage(page().id)],
    ['color background', () => store().updatePageBackground(page().id, { type: 'color', value: '#abcdef' })],
    ['image background', () => store().updatePageBackground(page().id, { type: 'image', value: asset.dataUrl })],
    ['title', () => store().updateProjectTitle('New title')],
    ['add asset', () => store().addAsset({ ...asset, id: 'another-asset' })],
    ['add layer', () => store().addLayer()],
    ['rename layer', () => store().renameLayer(store().activeLayerId, 'Renamed layer')],
    ['hide layer', () => store().setLayerVisibility(store().activeLayerId, false)],
    ['lock layer', () => store().setLayerLocked(store().activeLayerId, true)]
  ] satisfies [string, () => void][])('%s', (_name, mutate) => roundTrip(mutate));
  test.each(['move', 'delete'] as const)('%s populated page', (action) => {
    store().addPage();
    roundTrip(() => action === 'move' ? store().movePage(0, 1) : store().deletePage(page().id));
  });
  test('remove background', () => {
    store().updatePageBackground(page().id, { type: 'color', value: '#112233' });
    roundTrip(() => store().updatePageBackground(page().id, null));
  });
  test.each(['reorder', 'delete'] as const)('%s populated layer', (action) => {
    const originalLayer = store().activeLayerId;
    store().addLayer();
    roundTrip(() => action === 'reorder' ? store().reorderLayer(originalLayer, 1) : store().deleteLayer(originalLayer));
  });
  test('image deletion and page deletion retain reusable asset data', () => {
    store().addPage();
    roundTrip(() => {
      store().deletePage(page().id);
      expect(store().project.assets).toEqual([asset]);
    });
  });
});
