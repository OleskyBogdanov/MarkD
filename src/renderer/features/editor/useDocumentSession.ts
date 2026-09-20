import { useCallback, useEffect, useRef, useState } from 'react';
import { migrateProject, serializeProject } from '@/renderer/domain/model';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import type { OpenProjectResult, RecoveryRecord } from '@/shared/ipc-channels';
import type { OperationState } from './EditorWorkspace';

export const documentError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка.';
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
};

export const useDocumentSession = () => {
  const [path, setPath] = useState<string | null>(null);
  const pathRef = useRef<string | null>(null);
  const [operation, setOperation] = useState<OperationState>({ kind: 'idle', message: '' });
  const [recovery, setRecovery] = useState<RecoveryRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const active = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const transitioning = useRef(false);
  const recoveryQueue = useRef(Promise.resolve());
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportError = useCallback((error: unknown): void => {
    setOperation({ kind: 'error', message: documentError(error) });
  }, []);
  const updatePath = useCallback((next: string | null): void => {
    pathRef.current = next;
    setPath(next);
  }, []);
  const clearRecovery = useCallback(async (): Promise<void> => {
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    recoveryTimer.current = null;
    const task = recoveryQueue.current.then(() => window.desktop.clearRecovery());
    recoveryQueue.current = task.catch(reportError);
    await task;
  }, [reportError]);
  const persistRecovery = useCallback((): void => {
    recoveryTimer.current = null;
    const state = useEditorStore.getState();
    if (!active.current || !state.isDirty) return;
    try {
      const record: RecoveryRecord = { snapshot: serializeProject(state.project), path: pathRef.current, savedAt: new Date().toISOString() };
      recoveryQueue.current = recoveryQueue.current.then(() => window.desktop.writeRecovery(record)).catch(reportError);
    } catch (error) { reportError(error); }
  }, [reportError]);

  useEffect(() => {
    let mounted = true;
    void window.desktop.readRecovery().then(record => { if (mounted) setRecovery(record); }).catch(reportError).finally(() => { if (mounted) setReady(true); });
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      window.desktop.setDirtyState(state.isDirty);
      if (state.project !== previous.project && active.current && state.isDirty && !recoveryTimer.current) {
        recoveryTimer.current = setTimeout(persistRecovery, 1_000);
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    };
  }, [persistRecovery, reportError]);

  const save = useCallback((mode: 'save' | 'as' | 'copy' | 'template' = 'save'): Promise<boolean> => {
    if (saving.current) return saving.current;
    const task = (async (): Promise<boolean> => {
      try {
        flushPendingEdits();
        const state = useEditorStore.getState();
        const { project, sessionId, revision } = state;
        const snapshot = serializeProject({ ...project, metadata: { ...project.metadata, updatedAt: new Date().toISOString() } });
        setOperation({ kind: 'saving', message: 'Сохраняю документ…' });
        const nextPath = mode === 'template'
          ? await window.desktop.saveTemplate(snapshot)
          : mode === 'save' && pathRef.current
            ? await window.desktop.saveProject(snapshot, pathRef.current)
            : await window.desktop.saveProjectAs(snapshot);
        if (!nextPath) { setOperation({ kind: 'idle', message: '' }); return false; }
        if (useEditorStore.getState().sessionId !== sessionId) return false;
        if (mode === 'copy' || mode === 'template') {
          setOperation({ kind: 'success', message: `${mode === 'template' ? 'Шаблон' : 'Копия'} сохранён: ${nextPath}` });
          return true;
        }
        updatePath(nextPath);
        useEditorStore.getState().markSaved(sessionId, revision);
        flushPendingEdits();
        let clean = !useEditorStore.getState().isDirty;
        if (clean) await clearRecovery();
        flushPendingEdits();
        clean = !useEditorStore.getState().isDirty;
        if (!clean) persistRecovery();
        setOperation({ kind: 'success', message: clean ? `Сохранено: ${nextPath}` : 'Сохранена предыдущая версия. Есть несохранённые изменения.' });
        return clean;
      } catch (error) { reportError(error); return false; }
    })();
    saving.current = task;
    void task.finally(() => { saving.current = null; });
    return task;
  }, [clearRecovery, persistRecovery, reportError, updatePath]);

  const canLeave = useCallback(async (): Promise<boolean> => {
    try {
      if (saving.current) await saving.current;
      flushPendingEdits();
      if (!active.current || !useEditorStore.getState().isDirty) return true;
      const decision = await window.desktop.confirmSave();
      if (decision === 'cancel') return false;
      if (decision === 'save') return await save();
      return true;
    } catch (error) { reportError(error); return false; }
  }, [reportError, save]);

  const transition = useCallback(async (action: () => void | Promise<void>): Promise<void> => {
    if (transitioning.current) return;
    transitioning.current = true;
    setLocked(true);
    try {
      if (await canLeave()) await action();
    } catch (error) { reportError(error); }
    finally { transitioning.current = false; setLocked(false); }
  }, [canLeave, reportError]);

  useEffect(() => window.desktop.onCloseRequest(({ id }) => {
    window.desktop.acknowledgeClose(id);
    if (transitioning.current) { window.desktop.respondToClose(id, false); return; }
    transitioning.current = true;
    setLocked(true);
    void (async () => {
      let allow = false;
      try {
        allow = await canLeave();
        if (allow && active.current) {
          active.current = false;
          await clearRecovery();
        }
      } catch (error) { allow = false; active.current = true; reportError(error); }
      finally { transitioning.current = allow; setLocked(allow); window.desktop.respondToClose(id, allow); }
    })();
  }), [canLeave, clearRecovery, reportError]);

  useEffect(() => window.desktop.onCloseCancelled(() => {
    active.current = true;
    transitioning.current = false;
    setLocked(false);
    persistRecovery();
  }), [persistRecovery]);

  const start = useCallback(async (payload?: OpenProjectResult, kind: 'proposal' | 'blank' | 'template' = 'proposal'): Promise<void> => {
    // Validate before discarding the current recovery generation.
    const project = payload ? migrateProject(JSON.parse(payload.snapshot)) : null;
    await clearRecovery();
    active.current = false;
    if (project) {
      if (kind === 'template') project.metadata.id = `project_${crypto.randomUUID()}`;
      useEditorStore.getState().setProject(project);
    } else useEditorStore.getState().resetProject(kind === 'blank' ? 'blank' : 'proposal');
    updatePath(payload && kind !== 'template' ? payload.path : null);
    active.current = true;
    if (kind === 'template') { useEditorStore.getState().setDirty(true); persistRecovery(); }
    setOperation({ kind: 'success', message: payload ? `Открыт ${payload.path.split(/[\\/]/).at(-1)}` : 'Создан новый проект' });
  }, [clearRecovery, persistRecovery, updatePath]);

  const leave = useCallback(async (): Promise<void> => {
    await clearRecovery();
    active.current = false;
    useEditorStore.getState().resetProject();
    updatePath(null);
    setOperation({ kind: 'idle', message: '' });
  }, [clearRecovery, updatePath]);

  const restore = useCallback((): void => {
    if (!recovery) return;
    useEditorStore.getState().setProject(migrateProject(JSON.parse(recovery.snapshot)));
    updatePath(recovery.path);
    active.current = true;
    useEditorStore.getState().setDirty(true);
    setRecovery(null);
    persistRecovery();
    setOperation({ kind: 'success', message: 'Черновик восстановлен. Сохраните документ.' });
  }, [persistRecovery, recovery, updatePath]);
  const discardRecovery = useCallback(async (): Promise<void> => { await clearRecovery(); setRecovery(null); }, [clearRecovery]);

  return { ready, locked, path, operation, setOperation, recovery, restore, discardRecovery, start, leave, transition, save, reportError, canLeave };
};
