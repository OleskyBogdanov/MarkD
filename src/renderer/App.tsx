import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { migrateProject, serializeProject, type KpProject, type RenderMode } from '@/renderer/domain/model';
import { useEditorStore } from './store/useEditorStore';
import { EditorWorkspace, type OperationState } from './features/editor/EditorWorkspace';
import { StartScreen } from './components/StartScreen';
import type { OpenProjectResult, RecentProjectSummary } from '@/shared/ipc-channels';

const fileNameFromPath = (path: string): string => path.split(/[\\/]/).at(-1) ?? path;

const waitForDocumentPaint = async (): Promise<void> => new Promise((resolve) => {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
});

const serializeForSave = (project: KpProject): string => serializeProject({
  ...project,
  metadata: { ...project.metadata, updatedAt: new Date().toISOString() }
});

export const App = () => {
  const {
    project,
    selected,
    select,
    isDirty,
    setProject,
    resetProject,
    addPage,
    addText,
    addTextField,
    addSelectField,
    addTable,
    addImage,
    addShape,
    addAsset,
    setDirty,
    undo,
    redo,
    undoStack,
    redoStack,
    deleteSelected,
    setZoom,
    zoom
  } = useEditorStore(useShallow((state) => ({
    project: state.project,
    selected: state.selected,
    select: state.select,
    isDirty: state.isDirty,
    setProject: state.setProject,
    resetProject: state.resetProject,
    addPage: state.addPage,
    addText: state.addText,
    addTextField: state.addTextField,
    addSelectField: state.addSelectField,
    addTable: state.addTable,
    addImage: state.addImage,
    addShape: state.addShape,
    addAsset: state.addAsset,
    setDirty: state.setDirty,
    undo: state.undo,
    redo: state.redo,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    deleteSelected: state.deleteSelected,
    setZoom: state.setZoom,
    zoom: state.zoom
  })));

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<'home' | 'editor'>('home');
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationState>({ kind: 'idle', message: '' });
  const [renderMode, setRenderMode] = useState<RenderMode>('edit');
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const renderModeBeforePrint = useRef<Exclude<RenderMode, 'print'>>('edit');
  const saveInProgressRef = useRef(false);
  const isPreview = renderMode === 'preview';
  const isBusy = operation.kind === 'saving' || operation.kind === 'exporting';

  const loadRecentProjects = useCallback(async (): Promise<void> => {
    setRecentProjectsLoading(true);
    try {
      setRecentProjects(await window.desktop.getRecentProjects());
    } catch {
      setRecentProjects([]);
    } finally {
      setRecentProjectsLoading(false);
    }
  }, []);

  const confirmDiscardChanges = useCallback((): boolean =>
    !isDirty || window.confirm('Есть несохранённые изменения. Закрыть проект без сохранения?'), [isDirty]);

  const applyOpenedProject = useCallback((payload: OpenProjectResult): void => {
    const validated = migrateProject(JSON.parse(payload.snapshot));
    setProject(validated);
    setProjectPath(payload.path);
    setDirty(false);
    setWorkspace('editor');
    setOperation({ kind: 'success', message: `Открыт ${fileNameFromPath(payload.path)}` });
    void loadRecentProjects();
  }, [loadRecentProjects, setDirty, setProject]);

  const togglePreview = useCallback((): void => {
    const next = renderMode === 'preview' ? 'edit' : 'preview';
    if (next === 'preview') select({ type: 'none' });
    setRenderMode(next);
  }, [renderMode, select]);

  const handleOpenProject = useCallback(async (): Promise<void> => {
    if (!confirmDiscardChanges()) return;
    setOperation({ kind: 'idle', message: '' });
    try {
      const payload: OpenProjectResult | null = await window.desktop.openProject();
      if (!payload) return;

      applyOpenedProject(payload);
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось открыть документ. Проверьте формат файла.' });
    }
  }, [applyOpenedProject, confirmDiscardChanges]);

  const handleOpenRecentProject = useCallback(async (projectId: string): Promise<void> => {
    if (!confirmDiscardChanges()) return;
    setOpeningProjectId(projectId);
    setOperation({ kind: 'idle', message: '' });
    try {
      applyOpenedProject(await window.desktop.openRecentProject(projectId));
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось открыть проект. Возможно, файл был перемещён.' });
      await loadRecentProjects();
    } finally {
      setOpeningProjectId(null);
    }
  }, [applyOpenedProject, confirmDiscardChanges, loadRecentProjects]);

  const handleCreateProject = useCallback((): void => {
    if (!confirmDiscardChanges()) return;
    resetProject();
    setProjectPath(null);
    setWorkspace('editor');
    setOperation({ kind: 'success', message: 'Создан новый проект' });
  }, [confirmDiscardChanges, resetProject]);

  const handleShowProjects = useCallback((): void => {
    if (!confirmDiscardChanges()) return;
    select({ type: 'none' });
    setRenderMode('edit');
    setWorkspace('home');
    setOperation({ kind: 'idle', message: '' });
    void loadRecentProjects();
  }, [confirmDiscardChanges, loadRecentProjects, select]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (saveInProgressRef.current) return;
    saveInProgressRef.current = true;
    setOperation({ kind: 'saving', message: 'Сохраняю документ…' });
    try {
      const snapshot = serializeForSave(project);
      const path = projectPath
        ? await window.desktop.saveProject(snapshot, projectPath)
        : await window.desktop.saveProjectAs(snapshot);

      if (!path) {
        setOperation({ kind: 'idle', message: '' });
        return;
      }

      setProjectPath(path);
      setDirty(false);
      setOperation({ kind: 'success', message: `Сохранено: ${fileNameFromPath(path)}` });
      void loadRecentProjects();
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось сохранить документ. Проверьте доступ к папке.' });
    } finally {
      saveInProgressRef.current = false;
    }
  }, [loadRecentProjects, project, projectPath, setDirty]);

  const handleSaveTemplate = useCallback(async (): Promise<void> => {
    if (saveInProgressRef.current) return;
    saveInProgressRef.current = true;
    setOperation({ kind: 'saving', message: 'Сохраняю шаблон…' });
    try {
      const path = await window.desktop.saveTemplate(serializeForSave(project));
      if (!path) {
        setOperation({ kind: 'idle', message: '' });
        return;
      }

      setOperation({ kind: 'success', message: `Шаблон сохранён: ${fileNameFromPath(path)}` });
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось сохранить шаблон. Проверьте доступ к папке.' });
    } finally {
      saveInProgressRef.current = false;
    }
  }, [project]);

  const handleExport = useCallback(async (): Promise<void> => {
    setOperation({ kind: 'exporting', message: 'Готовлю PDF…' });
    const previousMode = renderMode === 'print' ? renderModeBeforePrint.current : renderMode;
    try {
      renderModeBeforePrint.current = previousMode;
      setRenderMode('print');
      await waitForDocumentPaint();
      const path = await window.desktop.exportPdf(serializeProject(project));
      if (!path) {
        setOperation({ kind: 'idle', message: '' });
        return;
      }
      setOperation({ kind: 'success', message: `PDF готов: ${fileNameFromPath(path)}` });
    } catch {
      setOperation({ kind: 'error', message: 'Экспорт PDF не удался. Проверьте макет и повторите.' });
    } finally {
      setRenderMode(previousMode);
    }
  }, [project, renderMode]);

  useEffect(() => {
    if (renderMode !== 'print') renderModeBeforePrint.current = renderMode;
  }, [renderMode]);

  useEffect(() => {
    const onBeforePrint = (): void => setRenderMode('print');
    const onAfterPrint = (): void => setRenderMode(renderModeBeforePrint.current);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  useEffect(() => {
    document.title = workspace === 'home' ? 'MarkD' : `${project.metadata.title} — MarkD`;
  }, [project.metadata.title, workspace]);

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    if (operation.kind !== 'success') return;
    const timeout = window.setTimeout(() => setOperation({ kind: 'idle', message: '' }), 4_000);
    return () => window.clearTimeout(timeout);
  }, [operation.kind]);

  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) {
      setOperation({ kind: 'error', message: 'Системный модуль Electron недоступен. Перезапустите приложение.' });
      return;
    }

    desktop.setDirtyState(isDirty);
  }, [isDirty]);

  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;

    const unsubscribe = desktop.onMenuCommand((payload) => {
      if (payload.command === 'new-document') {
        handleCreateProject();
      }
      if (payload.command === 'save') void handleSave();
      if (payload.command === 'open') void handleOpenProject();
      if (payload.command === 'export-pdf') void handleExport();
      if (payload.command === 'undo') undo();
      if (payload.command === 'redo') redo();
      if (payload.command === 'delete') deleteSelected();
    });

    return unsubscribe;
  }, [deleteSelected, handleCreateProject, handleExport, handleOpenProject, handleSave, redo, undo]);

  useEffect(() => {
    if (workspace !== 'editor') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      if (!event.repeat) void handleSave();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleSave, workspace]);

  useEffect(() => window.desktop.onExternalProjectOpen((payload) => {
    if (!confirmDiscardChanges()) return;
    try {
      applyOpenedProject(payload);
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось открыть документ, переданный системой.' });
    }
  }), [applyOpenedProject, confirmDiscardChanges]);

  const onAddText = useCallback((): void => {
    const pageId = project.pages[0]?.id;
    if (pageId) addText(pageId);
  }, [addText, project.pages]);

  const addToFirstPage = useCallback((action: (pageId: string) => void): void => {
    const pageId = project.pages[0]?.id;
    if (pageId) action(pageId);
  }, [project.pages]);

  const onAddImage = useCallback(async (): Promise<void> => {
    setOperation({ kind: 'idle', message: '' });
    try {
      const image = await window.desktop.importImage();
      if (!image) return;

      addAsset({ id: image.id, name: image.name, mimeType: image.mimeType, dataUrl: image.dataUrl });
      const pageId = project.pages[0]?.id;
      if (pageId) addImage(pageId, image.id);
    } catch {
      setOperation({ kind: 'error', message: 'Не удалось импортировать изображение.' });
    }
  }, [addAsset, addImage, project.pages]);

  if (workspace === 'home') {
    return (
      <StartScreen
        recentProjects={recentProjects}
        loading={recentProjectsLoading}
        openingProjectId={openingProjectId}
        statusMessage={operation.message}
        statusKind={operation.kind === 'error' ? 'error' : operation.kind === 'success' ? 'success' : 'idle'}
        onCreate={handleCreateProject}
        onOpen={() => void handleOpenProject()}
        onOpenRecent={(projectId) => void handleOpenRecentProject(projectId)}
      />
    );
  }

  return (
    <EditorWorkspace
      project={project}
      renderMode={renderMode}
      zoom={zoom}
      inspectorWidth={inspectorWidth}
      operation={operation}
      onInspectorWidthChange={setInspectorWidth}
      onShowProjects={handleShowProjects}
      onTogglePreview={togglePreview}
      onZoomChange={setZoom}
      toolbarProps={{
        onAddPage: addPage,
        onAddText,
        onAddTextField: () => addToFirstPage(addTextField),
        onAddSelectField: () => addToFirstPage(addSelectField),
        onAddTable: () => addToFirstPage(addTable),
        onAddImage: () => void onAddImage(),
        onAddShape: (shape) => addToFirstPage((pageId) => addShape(pageId, shape)),
        onSaveFile: () => void handleSave(),
        onSaveTemplate: () => void handleSaveTemplate(),
        onOpen: () => void handleOpenProject(),
        selected,
        onUndo: undo,
        onRedo: redo,
        onDelete: deleteSelected,
        onZoomIn: () => setZoom(Math.min(2, zoom + 0.1)),
        onZoomOut: () => setZoom(Math.max(0.5, zoom - 0.1)),
        isDirty,
        isBusy,
        onExport: () => void handleExport(),
        isPreview,
        onTogglePreview: togglePreview,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        zoom
      }}
    />
  );
};
