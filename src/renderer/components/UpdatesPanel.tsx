import { useEffect, useState } from 'react';
import type { UpdateState } from '@/shared/ipc-channels';

const labels: Record<UpdateState['status'], string> = {
  disabled: 'Обновления появятся в подписанной release-сборке.', idle: 'Можно проверить наличие новой версии.',
  checking: 'Проверяю обновления…', available: 'Доступна новая версия.', downloading: 'Загружаю обновление…',
  downloaded: 'Обновление готово к установке.', installing: 'Перезапускаю приложение…', error: 'Не удалось обновить приложение.'
};
export const UpdatesPanel = () => {
  const [state, setState] = useState<UpdateState | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let mounted = true;
    const receive = (next: UpdateState): void => { if (mounted) setState(next); };
    const unsubscribe = window.desktop.onUpdateState(receive);
    const unsubscribeShow = window.desktop.onShowUpdates(() => setExpanded(true));
    void window.desktop.getUpdateState().then(receive).catch(() => {});
    return () => { mounted = false; unsubscribe(); unsubscribeShow(); };
  }, []);
  if (!state) return null;
  const action = (command: 'check' | 'download' | 'install'): void => {
    void window.desktop.updateAction(command).then(setState).catch(error => setState(current => current ? { ...current, status: 'error', message: String(error) } : current));
  };
  const notice = state.status === 'downloaded' || state.status === 'available';
  return <aside className="updates-panel" aria-label="Обновления MarkD">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {notice ? `Доступна версия ${state.version}` : `MarkD ${state.currentVersion}`} · Обновления
    </button>
    {expanded ? <div className="updates-content">
      <p role="status">{state.message || labels[state.status]} {state.status === 'downloading' ? `${state.percent ?? 0}%` : ''}</p>
      {state.notes ? <details><summary>Что нового</summary><p className="release-notes">{state.notes}</p></details> : null}
      {['idle', 'error'].includes(state.status) ? <button type="button" onClick={() => action('check')}>Проверить обновления</button> : null}
      {state.status === 'available' ? <button type="button" onClick={() => action('download')}>Скачать обновление</button> : null}
      {state.status === 'downloaded' ? <button type="button" onClick={() => action('install')}>Перезапустить и обновить</button> : null}
      <button type="button" onClick={() => setExpanded(false)}>Позже</button>
    </div> : null}
  </aside>;
};
