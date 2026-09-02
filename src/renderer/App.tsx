import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, CheckCircle2, EyeOff, House, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { migrateProject, serializeProject, type KpProject, type RenderMode } from '@/renderer/domain/model';
import { useEditorStore } from './store/useEditorStore';
import { ProjectCanvas } from './features/editor/ProjectCanvas';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './features/editor/Inspector';
import { LayersPanel } from './features/editor/LayersPanel';
import { InspectorResizeHandle } from './components/InspectorResizeHandle';
import { StartScreen } from './components/StartScreen';
import type { OpenProjectResult, RecentProjectSummary } from '@/shared/ipc-channels';

type OperationKind = 'idle' | 'saving' | 'exporting' | 'success' | 'error';

type OperationState = {
  kind: OperationKind;
  message: string;
};

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
  } = useEditorStore();

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<'home' | 'editor'>('home');
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>([]);
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(true);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationState>({ kind: 'idle', message: '' });
  const [renderMode, setRenderMode] = useState<RenderMode>('edit');
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const renderModeBeforePrint = useRef<Exclude<RenderMode, 'print'>>('edit');
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
    }
  }, [loadRecentProjects, project, projectPath, setDirty]);

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

  const statusIcon = operation.kind === 'success'
    ? <CheckCircle2 size={17} />
    : operation.kind === 'error'
      ? <AlertCircle size={17} />
      : <LoaderCircle className="spin" size={17} />;

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
    <div
      className={`app-shell mode-${renderMode} ${isPreview ? 'preview-mode' : ''}`}
      style={{ '--inspector-width': `${inspectorWidth}px` } as CSSProperties}
    >
      {renderMode === 'edit' ? <header className="app-header">
        <div className="brand-lockup">
          <button type="button" className="brand-mark brand-home-button" aria-label="К проектам" title="К проектам" onClick={handleShowProjects}>M</button>
          <div>
            <span className="brand-name">MARKD</span>
            <h1>{project.metadata.title}</h1>
          </div>
        </div>

        <Toolbar
          onAddPage={addPage}
          onAddText={onAddText}
          onAddTextField={() => addToFirstPage(addTextField)}
          onAddSelectField={() => addToFirstPage(addSelectField)}
          onAddTable={() => addToFirstPage(addTable)}
          onAddImage={() => void onAddImage()}
          onAddShape={(shape) => addToFirstPage((pageId) => addShape(pageId, shape))}
          onSave={() => void handleSave()}
          onOpen={() => void handleOpenProject()}
          selected={selected}
          onUndo={undo}
          onRedo={redo}
          onDelete={deleteSelected}
          onZoomIn={() => setZoom(Math.min(2, zoom + 0.1))}
          onZoomOut={() => setZoom(Math.max(0.5, zoom - 0.1))}
          isDirty={isDirty}
          isBusy={isBusy}
          onExport={() => void handleExport()}
          isPreview={isPreview}
          onTogglePreview={togglePreview}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          zoom={zoom}
        />

        <div className="document-readout" aria-label={`Масштаб ${Math.round(zoom * 100)} процентов`}>
          <House size={13} aria-hidden="true" />
          <strong>{Math.round(zoom * 100)}%</strong>
          <span>A4 · {project.pages.length} стр.</span>
        </div>
      </header> : renderMode === 'preview' ? (
        <header className="preview-header" aria-label="Панель предпросмотра">
          <span>Предпросмотр документа</span>
          <div>
            <button type="button" aria-label="Уменьшить" title="Уменьшить" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} disabled={zoom <= 0.5}><ZoomOut size={16} aria-hidden="true" /></button>
            <strong aria-label={`Масштаб ${Math.round(zoom * 100)} процентов`}>{Math.round(zoom * 100)}%</strong>
            <button type="button" aria-label="Увеличить" title="Увеличить" onClick={() => setZoom(Math.min(2, zoom + 0.1))} disabled={zoom >= 2}><ZoomIn size={16} aria-hidden="true" /></button>
            <button type="button" className="exit-preview-button" aria-label="Вернуться к редактированию" title="Вернуться к редактированию" onClick={togglePreview}><EyeOff size={16} aria-hidden="true" /> Вернуться</button>
          </div>
        </header>
      ) : null}

      <main className="app-main">
        <section
          className="canvas-col"
          aria-label="Рабочая область документа"
          onPointerDown={renderMode === 'edit' ? (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('.canvas-element')) return;
            select({ type: 'none' });
          } : undefined}
        >
          <ProjectCanvas
            project={project}
            zoom={zoom}
            renderMode={renderMode}
          />
        </section>
        {renderMode === 'edit' ? (
          <>
            <InspectorResizeHandle width={inspectorWidth} onChange={setInspectorWidth} />
            <aside className="inspector-col" aria-label="Инспектор свойств">
              <LayersPanel />
              <Inspector />
            </aside>
          </>
        ) : null}
      </main>

      {renderMode === 'edit' && operation.kind !== 'idle' ? (
        <div className={`status-toast status-${operation.kind}`} role="status" aria-live="polite">
          {statusIcon}
          <span>{operation.message}</span>
        </div>
      ) : null}
    </div>
  );
};
