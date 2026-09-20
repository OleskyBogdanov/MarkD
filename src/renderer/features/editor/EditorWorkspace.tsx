import { AlertCircle, CheckCircle2, EyeOff, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageNavigator } from './PageNavigator';
import { mmToPx } from '@/renderer/domain/model';
import type { ComponentProps, CSSProperties, PointerEvent } from 'react';
import type { KpProject, RenderMode } from '@/renderer/domain/model';
import { InspectorResizeHandle } from '@/renderer/components/InspectorResizeHandle';
import { Toolbar } from '@/renderer/components/Toolbar';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { EditorSidebar } from './EditorSidebar';
import { ProjectCanvas } from './ProjectCanvas';
import './editor-workspace.css';

export type OperationKind = 'idle' | 'saving' | 'exporting' | 'success' | 'error';

export type OperationState = {
  kind: OperationKind;
  message: string;
};

type EditorWorkspaceProps = {
  project: KpProject;
  renderMode: RenderMode;
  zoom: number;
  inspectorWidth: number;
  operation: OperationState;
  toolbarProps: ComponentProps<typeof Toolbar>;
  onInspectorWidthChange: (width: number) => void;
  onShowProjects: () => void;
  onTogglePreview: () => void;
  onZoomChange: (zoom: number) => void;
};

const EditorHeader = ({
  project,
  zoom,
  toolbarProps,
  onShowProjects
}: Pick<EditorWorkspaceProps, 'project' | 'zoom' | 'toolbarProps' | 'onShowProjects'>) => (
  <header className="app-header">
    <div className="brand-lockup">
      <button type="button" className="brand-mark brand-home-button" aria-label="К проектам" title="К проектам" onClick={onShowProjects}>M</button>
      <div>
        <span className="brand-name">MARKD</span>
        <h1>{project.metadata.title}</h1>
      </div>
    </div>

    <Toolbar {...toolbarProps} />

    <div className="document-readout" aria-label={`Масштаб ${Math.round(zoom * 100)} процентов`}>
      <strong>{Math.round(zoom * 100)}%</strong>
      <span>A4 · {project.pages.length} стр.</span>
    </div>
  </header>
);

const PreviewHeader = ({
  zoom,
  onTogglePreview,
  onZoomChange
}: Pick<EditorWorkspaceProps, 'zoom' | 'onTogglePreview' | 'onZoomChange'>) => (
  <header className="preview-header" aria-label="Панель предпросмотра">
    <span>Предпросмотр документа</span>
    <div>
      <button type="button" aria-label="Уменьшить" title="Уменьшить" onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} disabled={zoom <= 0.25}><ZoomOut size={16} aria-hidden="true" /></button>
      <strong aria-label={`Масштаб ${Math.round(zoom * 100)} процентов`}>{Math.round(zoom * 100)}%</strong>
      <button type="button" aria-label="Увеличить" title="Увеличить" onClick={() => onZoomChange(Math.min(2, zoom + 0.1))} disabled={zoom >= 2}><ZoomIn size={16} aria-hidden="true" /></button>
      <button type="button" className="exit-preview-button" aria-label="Вернуться к редактированию" title="Вернуться к редактированию" onClick={onTogglePreview}><EyeOff size={16} aria-hidden="true" /> Вернуться</button>
    </div>
  </header>
);

const OperationToast = ({ operation }: Pick<EditorWorkspaceProps, 'operation'>) => {
  const isIdle = operation.kind === 'idle';
  const icon = isIdle
    ? null
    : operation.kind === 'success'
      ? <CheckCircle2 size={17} aria-hidden="true" />
      : operation.kind === 'error'
        ? <AlertCircle size={17} aria-hidden="true" />
        : <LoaderCircle className="spin" size={17} aria-hidden="true" />;

  return (
    <div
      className={isIdle ? 'sr-only' : `status-toast status-${operation.kind}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {icon}
      <span>{operation.message}</span>
    </div>
  );
};

export const EditorWorkspace = ({
  project,
  renderMode,
  zoom,
  inspectorWidth,
  operation,
  toolbarProps,
  onInspectorWidthChange,
  onShowProjects,
  onTogglePreview,
  onZoomChange
}: EditorWorkspaceProps) => {
  const select = useEditorStore((state) => state.select);
  const isPreview = renderMode === 'preview';
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [pageError, setPageError] = useState('');
  const canvasRef = useRef<HTMLElement>(null);
  const fit = (whole: boolean): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const current = project.pages.find(page => page.id === useEditorStore.getState().activePageId) ?? project.pages[0];
    const width = (canvas.clientWidth - 80) / mmToPx(current.widthMm);
    const height = (canvas.clientHeight - 90) / mmToPx(current.heightMm);
    onZoomChange(Math.max(0.25, Math.min(2, whole ? Math.min(width, height) : width)));
  };

  const handleCanvasPointerDown = (event: PointerEvent<HTMLElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('.canvas-element')) return;
    select({ type: 'none' });
  };

  return (
    <div
      className={`app-shell mode-${renderMode} ${isPreview ? 'preview-mode' : ''} ${!sidebarVisible ? 'sidebar-hidden' : ''}`}
      style={{ '--inspector-width': `${inspectorWidth}px` } as CSSProperties}
    >
      {renderMode === 'edit' ? (
        <EditorHeader project={project} zoom={zoom} toolbarProps={toolbarProps} onShowProjects={onShowProjects} />
      ) : renderMode === 'preview' ? (
        <PreviewHeader zoom={zoom} onTogglePreview={onTogglePreview} onZoomChange={onZoomChange} />
      ) : null}

      {renderMode !== 'print' ? <div className="workspace-controls">
        {renderMode === 'edit' ? <PageNavigator onError={setPageError} /> : null}
        <div className="view-controls">
          <button type="button" onClick={() => fit(false)}>По ширине</button>
          <button type="button" onClick={() => fit(true)}>Вся страница</button>
          {renderMode === 'edit' ? <button type="button" aria-pressed={sidebarVisible} onClick={() => setSidebarVisible(value => !value)}>Свойства</button> : null}
        </div>
        {pageError ? <span role="alert">{pageError}</span> : null}
      </div> : null}
      <main className="app-main">
        <section
          ref={canvasRef}
          className="canvas-col"
          aria-label="Рабочая область документа"
          onPointerDown={renderMode === 'edit' ? handleCanvasPointerDown : undefined}
        >
          <ProjectCanvas project={project} zoom={zoom} renderMode={renderMode} />
        </section>
        {renderMode === 'edit' && sidebarVisible ? (
          <>
            <InspectorResizeHandle width={inspectorWidth} onChange={onInspectorWidthChange} />
            <EditorSidebar />
          </>
        ) : null}
      </main>

      {renderMode !== 'print' ? <OperationToast operation={operation} /> : null}
    </div>
  );
};
