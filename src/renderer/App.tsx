import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { serializeProject, type RenderMode } from '@/renderer/domain/model';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';
import { useEditorStore } from './store/useEditorStore';
import { EditorWorkspace } from './features/editor/EditorWorkspace';
import { useDocumentSession } from './features/editor/useDocumentSession';
import { UpdatesPanel } from './components/UpdatesPanel';
import { StartScreen } from './components/StartScreen';
import type { MenuCommandPayload, OpenProjectResult, RecentProjectSummary } from '@/shared/ipc-channels';

const waitForDocumentPaint = async (): Promise<void> => new Promise(resolve => {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
});
const isTextEditing = (): boolean => document.activeElement instanceof HTMLElement &&
  Boolean(document.activeElement.closest('input, textarea, [contenteditable="true"]'));

export const App = () => {
  const { project, selected, isDirty, undoStack, redoStack, zoom } = useEditorStore(useShallow(state => ({
    project: state.project, selected: state.selected, isDirty: state.isDirty,
    undoStack: state.undoStack, redoStack: state.redoStack, zoom: state.zoom
  })));
  const { ready, locked, path, operation, setOperation, recovery, restore, discardRecovery, start, leave, transition, save, reportError } = useDocumentSession();
  const [workspace, setWorkspace] = useState<'home' | 'editor'>('home');
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>('edit');
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const exporting = useRef(false);
  const renderModeBeforePrint = useRef<Exclude<RenderMode, 'print'>>('edit');
  const isPreview = renderMode === 'preview';
  const isBusy = operation.kind === 'saving' || operation.kind === 'exporting';
  const loadRecentProjects = useCallback(async (): Promise<void> => {
    setRecentProjectsLoading(true);
    try { setRecentProjects(await window.desktop.getRecentProjects()); }
    catch (error) { reportError(error); }
    finally { setRecentProjectsLoading(false); }
  }, [reportError]);

  const openEditor = useCallback(async (payload?: OpenProjectResult, kind: 'proposal' | 'blank' | 'template' = 'proposal'): Promise<void> => {
    await start(payload, kind);
    setRenderMode('edit');
    setWorkspace('editor');
    void loadRecentProjects();
  }, [start, loadRecentProjects]);
  const handleOpen = useCallback((template = false): void => {
    if (exporting.current || recovery) return;
    void transition(async () => {
      const payload = await window.desktop.openProject();
      if (payload) await openEditor(payload, template ? 'template' : 'proposal');
    });
  }, [openEditor, recovery, transition]);
  const handleCreate = useCallback((kind: 'proposal' | 'blank' = 'proposal'): void => {
    if (!exporting.current && !recovery) void transition(() => openEditor(undefined, kind));
  }, [openEditor, recovery, transition]);
  const handleSave = useCallback(async (mode: 'save' | 'as' | 'copy' | 'template' = 'save'): Promise<void> => {
    if (workspace !== 'editor' || exporting.current) return;
    await save(mode);
    void loadRecentProjects();
  }, [loadRecentProjects, save, workspace]);
  const togglePreview = useCallback((): void => {
    if (exporting.current) return;
    try {
      flushPendingEdits();
      useEditorStore.getState().select({ type: 'none' });
      setRenderMode(mode => mode === 'preview' ? 'edit' : 'preview');
    } catch (error) { reportError(error); }
  }, [reportError]);
  const handleExport = useCallback(async (): Promise<void> => {
    if (workspace !== 'editor' || exporting.current || operation.kind === 'saving') return;
    exporting.current = true;
    const previousMode = renderMode === 'print' ? renderModeBeforePrint.current : renderMode;
    try {
      flushPendingEdits();
      const snapshot = serializeProject(useEditorStore.getState().project);
      setOperation({ kind: 'exporting', message: 'Готовлю PDF…' });
      renderModeBeforePrint.current = previousMode;
      setRenderMode('print');
      await waitForDocumentPaint();
      const result = await window.desktop.exportPdf(snapshot);
      setOperation(result ? { kind: 'success', message: `PDF готов: ${result}` } : { kind: 'idle', message: '' });
    } catch (error) { reportError(error); }
    finally { setRenderMode(previousMode); exporting.current = false; }
  }, [operation.kind, renderMode, reportError, setOperation, workspace]);

  const executeCommand = useCallback((command: MenuCommandPayload['command']): void => {
    if (command === 'new-document') { handleCreate(); return; }
    if (command === 'open') { handleOpen(); return; }
    if (workspace !== 'editor' || exporting.current) return;
    if (command === 'save' || command === 'save-as') { void handleSave(command === 'save' ? 'save' : 'as'); return; }
    if (command === 'export-pdf') { void handleExport(); return; }
    if (renderMode !== 'edit') return;
    if (isTextEditing() && command === 'duplicate') return;
    if (isTextEditing() && (command === 'undo' || command === 'redo' || command === 'delete')) {
      window.desktop.nativeEdit(command);
      return;
    }
    try {
      flushPendingEdits();
      const state = useEditorStore.getState();
      if (command === 'undo') state.undo();
      if (command === 'redo') state.redo();
      if (command === 'delete') state.deleteSelected();
      if (command === 'duplicate') state.duplicateSelected();
    } catch (error) { reportError(error); }
  }, [handleCreate, handleExport, handleOpen, handleSave, renderMode, reportError, workspace]);

  useEffect(() => window.desktop.onMenuCommand(({ command }) => executeCommand(command)), [executeCommand]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.repeat) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      let command: MenuCommandPayload['command'] | undefined;
      if (modifier && key === 's') command = event.shiftKey ? 'save-as' : 'save';
      if (modifier && !isTextEditing() && key === 'z') command = event.shiftKey ? 'redo' : 'undo';
      if (modifier && !isTextEditing() && key === 'y') command = 'redo';
      if (modifier && !isTextEditing() && key === 'd') command = 'duplicate';
      if (!modifier && !isTextEditing() && (key === 'delete' || key === 'backspace')) command = 'delete';
      if (command) { event.preventDefault(); executeCommand(command); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [executeCommand]);
  useEffect(() => {
    if (!ready || recovery) return;
    return window.desktop.onExternalProjectOpen(payload => {
    if (!exporting.current) void transition(() => openEditor(payload));
    });
  }, [openEditor, ready, recovery, transition]);
  useEffect(() => { void loadRecentProjects(); }, [loadRecentProjects]);
  useEffect(() => {
    if (operation.kind !== 'success') return;
    const timer = window.setTimeout(() => setOperation({ kind: 'idle', message: '' }), 4_000);
    return () => window.clearTimeout(timer);
  }, [operation.kind, operation.message, setOperation]);
  useEffect(() => { document.title = workspace === 'home' ? 'MarkD' : `${isDirty && renderMode !== 'print' ? '● ' : ''}${project.metadata.title} — MarkD`; }, [isDirty, project.metadata.title, renderMode, workspace]);
  useEffect(() => {
    if (renderMode !== 'print') renderModeBeforePrint.current = renderMode;
  }, [renderMode]);
  useEffect(() => {
    const before = (): void => { flushPendingEdits(); setRenderMode('print'); };
    const after = (): void => setRenderMode(renderModeBeforePrint.current);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const addToPage = (action: (pageId: string) => void): void => {
    try {
      flushPendingEdits();
      const state = useEditorStore.getState();
      const pageId = state.activePageId ?? state.project.pages[0]?.id;
      if (pageId) action(pageId);
    } catch (error) { reportError(error); }
  };
  const addImage = async (): Promise<void> => {
    const state = useEditorStore.getState();
    const pageId = state.activePageId ?? state.project.pages[0]?.id;
    try {
      const image = await window.desktop.importImage();
      const current = useEditorStore.getState();
      if (!image || !pageId || current.sessionId !== state.sessionId || !current.project.pages.some(page => page.id === pageId)) return;
      current.addAsset(image);
      current.addImage(pageId, image.id);
    } catch (error) { reportError(error); }
  };

  if (!ready) return <main role="status">Загрузка документа…</main>;
  if (workspace === 'home') return <div inert={locked}><StartScreen
    recentProjects={recentProjects} loading={recentProjectsLoading} openingProjectId={openingProjectId}
    statusMessage={operation.message} statusKind={operation.kind === 'error' ? 'error' : operation.kind === 'success' ? 'success' : 'idle'}
    recovery={recovery} onRestore={() => { restore(); setRenderMode('edit'); setWorkspace('editor'); }}
    onDiscardRecovery={() => { void discardRecovery().catch(reportError); }}
    onCreate={() => handleCreate()} onCreateBlank={() => handleCreate('blank')} onOpenTemplate={() => handleOpen(true)}
    onOpen={() => handleOpen()} onOpenRecent={projectId => {
      if (recovery) return;
      void transition(async () => {
        setOpeningProjectId(projectId);
        try { await openEditor(await window.desktop.openRecentProject(projectId)); }
        finally { setOpeningProjectId(null); void loadRecentProjects(); }
      });
    }} /><UpdatesPanel /></div>;

  const state = useEditorStore.getState();
  return <div inert={locked}><EditorWorkspace project={project} renderMode={renderMode} zoom={zoom} inspectorWidth={inspectorWidth}
    operation={operation} onInspectorWidthChange={setInspectorWidth}
    onShowProjects={() => { if (!exporting.current) void transition(async () => { await leave(); setRenderMode('edit'); setWorkspace('home'); void loadRecentProjects(); }); }}
    onTogglePreview={togglePreview} onZoomChange={state.setZoom}
    toolbarProps={{
      onAddPage: () => addToPage(() => state.addPage()),
      onAddText: () => addToPage(state.addText), onAddTextField: () => addToPage(state.addTextField),
      onAddSelectField: () => addToPage(state.addSelectField), onAddTable: () => addToPage(state.addTable),
      onAddImage: () => { void addImage(); }, onAddShape: shape => addToPage(pageId => state.addShape(pageId, shape)),
      onSaveFile: () => { void handleSave(); }, onSaveAs: () => { void handleSave('as'); },
      onSaveCopy: () => { void handleSave('copy'); }, onSaveTemplate: () => { void handleSave('template'); },
      onReveal: path ? () => { void window.desktop.revealProject(path).catch(reportError); } : undefined,
      onOpen: () => handleOpen(), selected,
      onUndo: () => executeCommand('undo'), onRedo: () => executeCommand('redo'), onDelete: () => executeCommand('delete'),
      onZoomIn: () => state.setZoom(Math.min(2, zoom + 0.1)), onZoomOut: () => state.setZoom(Math.max(0.25, zoom - 0.1)),
      isDirty, isBusy, onExport: () => { void handleExport(); }, isPreview, onTogglePreview: togglePreview,
      canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, zoom
    }} /><UpdatesPanel /></div>;
};
