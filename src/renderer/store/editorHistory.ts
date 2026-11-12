import { DEFAULT_LAYER_ID, projectSchema, type KpLayer } from '@/renderer/domain/model';
import type { EditorState } from './useEditorStore';

const HISTORY_LIMIT = 100;

export const preferredActiveLayer = (layers: readonly KpLayer[]): string =>
  layers.find(layer => layer.visible && !layer.locked)?.id ?? layers[0]?.id ?? DEFAULT_LAYER_ID;

export const applyHistory = (
  state: EditorState,
  mutate: (draft: EditorState) => boolean | void,
  historyGroupKey?: string
): EditorState => {
  const now = Date.now();
  const draft: EditorState = {
    ...state,
    project: {
      ...state.project,
      metadata: { ...state.project.metadata },
      layers: state.project.layers.map(layer => ({ ...layer })),
      pages: state.project.pages.map(page => ({
        ...page,
        background: page.background ? { ...page.background } : null,
        elements: page.elements.map(element => JSON.parse(JSON.stringify(element)))
      })),
      assets: [...state.project.assets],
      styles: { ...state.project.styles }
    },
    selected: { ...state.selected }
  };
  if (!mutate(draft)) return state;
  if (!historyGroupKey) draft.project = projectSchema.parse(draft.project);
  const joinsPreviousHistory = state.historyTransaction !== null
    ? state.historyTransaction.changed
    : Boolean(historyGroupKey && state.historyGroup?.key === historyGroupKey
      && now - state.historyGroup.updatedAt < 1_000);
  return {
    ...draft,
    undoStack: joinsPreviousHistory ? state.undoStack : [...state.undoStack, state.project].slice(-HISTORY_LIMIT),
    redoStack: [],
    isDirty: true,
    revision: state.revision + 1,
    historyGroup: historyGroupKey ? { key: historyGroupKey, updatedAt: now } : null,
    historyTransaction: state.historyTransaction === null ? null : { changed: true }
  };
};

const traverseHistory = (state: EditorState, direction: 'undo' | 'redo'): EditorState => {
  const stack = direction === 'undo' ? state.undoStack : state.redoStack;
  const project = stack.at(-1);
  if (!project) return state;
  return {
    ...state,
    project,
    undoStack: direction === 'undo' ? stack.slice(0, -1) : [...state.undoStack, state.project].slice(-HISTORY_LIMIT),
    redoStack: direction === 'redo' ? stack.slice(0, -1) : [...state.redoStack, state.project].slice(-HISTORY_LIMIT),
    selected: { type: 'none' },
    activeLayerId: project.layers.some(layer => layer.id === state.activeLayerId && layer.visible && !layer.locked)
      ? state.activeLayerId : preferredActiveLayer(project.layers),
    activePageId: project.pages.some(page => page.id === state.activePageId)
      ? state.activePageId : project.pages[0]?.id ?? null,
    isDirty: true,
    revision: state.revision + 1,
    historyGroup: null,
    historyTransaction: null
  };
};

type HistoryActions = Pick<EditorState, 'undo' | 'redo' | 'beginHistoryTransaction' | 'endHistoryTransaction' | 'endHistoryGroup'>;
type SetEditor = (update: (state: EditorState) => Partial<EditorState>) => void;

export const createHistoryActions = (set: SetEditor): HistoryActions => ({
  undo: () => set(state => traverseHistory(state, 'undo')),
  redo: () => set(state => traverseHistory(state, 'redo')),
  beginHistoryTransaction: () => set(() => ({ historyTransaction: { changed: false }, historyGroup: null })),
  endHistoryTransaction: () => set(() => ({ historyTransaction: null, historyGroup: null })),
  endHistoryGroup: () => set(() => ({ historyGroup: null }))
});
