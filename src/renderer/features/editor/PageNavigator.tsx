import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';

export const PageNavigator = ({ onError }: { onError: (message: string) => void }) => {
  const { pages, activePageId } = useEditorStore(useShallow(state => ({ pages: state.project.pages, activePageId: state.activePageId })));
  const index = Math.max(0, pages.findIndex(page => page.id === activePageId));
  const current = pages[index];
  const run = (action: () => void): void => {
    try { flushPendingEdits(); action(); }
    catch (error) { onError(error instanceof Error ? error.message : 'Не удалось изменить страницу.'); }
  };
  const go = (id: string): void => run(() => {
    useEditorStore.getState().select({ type: 'none' });
    useEditorStore.getState().setActivePage(id);
    document.querySelector(`[data-page-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  return <nav className="page-navigator" aria-label="Страницы документа">
    <label>Страница <select aria-label="Текущая страница" value={current.id} onChange={event => go(event.currentTarget.value)}>
      {pages.map((page, i) => <option key={page.id} value={page.id}>{i + 1} из {pages.length}</option>)}
    </select></label>
    <button type="button" onClick={() => run(() => useEditorStore.getState().duplicatePage(current.id))}>Дублировать страницу</button>
    <button type="button" disabled={index === 0} onClick={() => run(() => useEditorStore.getState().movePage(index, index - 1))}>Выше</button>
    <button type="button" disabled={index === pages.length - 1} onClick={() => run(() => useEditorStore.getState().movePage(index, index + 1))}>Ниже</button>
    <button type="button" disabled={pages.length === 1} onClick={() => run(() => useEditorStore.getState().deletePage(current.id))}>Удалить страницу</button>
  </nav>;
};
