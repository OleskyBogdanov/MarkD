import { beforeEach, expect, test } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { resolveTableCellAlign, resolveTableCellVerticalAlign } from '@/renderer/domain/tableStyle';

beforeEach(() => useEditorStore.getState().resetProject());

test.each(['row', 'column'] as const)('наследование %s сбрасывает обе оси одной отменяемой операцией', (type) => {
  const actions = useEditorStore.getState();
  const pageId = actions.project.pages[0].id;
  const table = actions.project.pages[0].elements.find((element) => element.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Таблица не найдена');
  const rowId = table.rows[0].id;
  const columnId = table.columns[0];
  if (type === 'row') {
    actions.updateTableRowAlign(pageId, table.id, rowId, 'right');
    actions.updateTableRowVerticalAlign(pageId, table.id, rowId, 'bottom');
  } else {
    actions.updateTableColumnAlign(pageId, table.id, columnId, 'right');
    actions.updateTableColumnVerticalAlign(pageId, table.id, columnId, 'bottom');
  }

  actions.resetTableAlignment(pageId, table.id, { type, id: type === 'row' ? rowId : columnId });

  const reset = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
  if (!reset || reset.type !== 'table') throw new Error('Таблица потеряна');
  expect(resolveTableCellAlign(reset, rowId, columnId)).toBe(table.style.align);
  expect(resolveTableCellVerticalAlign(reset, rowId, columnId)).toBe(table.style.verticalAlign);
  actions.undo();
  const restored = useEditorStore.getState().project.pages[0].elements.find((element) => element.id === table.id);
  if (!restored || restored.type !== 'table') throw new Error('Таблица потеряна после отмены');
  expect(resolveTableCellAlign(restored, rowId, columnId)).toBe('right');
  expect(resolveTableCellVerticalAlign(restored, rowId, columnId)).toBe('bottom');
});
