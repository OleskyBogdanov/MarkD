import { beforeEach, expect, test } from 'vitest';
import { useEditorStore } from '../useEditorStore';

beforeEach(() => useEditorStore.getState().resetProject());

test('выбор элемента активирует его слой без изменения документа и истории', () => {
  const state = useEditorStore.getState();
  const page = state.project.pages[0];
  const element = page.elements[0];
  state.addLayer();
  const before = useEditorStore.getState();

  before.select({ type: 'element', pageId: page.id, elementId: element.id });

  const after = useEditorStore.getState();
  expect(after.selected).toEqual({ type: 'element', pageId: page.id, elementId: element.id });
  expect(after.activeLayerId).toBe(element.layerId);
  expect(after.project).toBe(before.project);
  expect(after.undoStack).toBe(before.undoStack);
});

test.each(['locked', 'hidden'] as const)('выбор элемента не активирует недоступный слой: %s', (reason) => {
  const state = useEditorStore.getState();
  const page = state.project.pages[0];
  const element = page.elements[0];
  state.addLayer();
  const activeLayerId = useEditorStore.getState().activeLayerId;
  if (reason === 'locked') state.setLayerLocked(element.layerId, true);
  else state.setLayerVisibility(element.layerId, false);

  state.select({ type: 'element', pageId: page.id, elementId: element.id });

  expect(useEditorStore.getState().selected).toEqual({ type: 'none' });
  expect(useEditorStore.getState().activeLayerId).toBe(activeLayerId);
});
