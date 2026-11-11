import { AlertCircle, CheckCircle2, EyeOff, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mmToPx } from '@/renderer/domain/model';
import type { ComponentProps, CSSProperties, PointerEvent } from 'react';
import type { KpProject, RenderMode } from '@/renderer/domain/model';
import { InspectorResizeHandle } from '@/renderer/components/InspectorResizeHandle';
import { Toolbar } from '@/renderer/components/Toolbar';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { registerPendingEdit } from '@/renderer/domain/pendingEdits';
import { EditorSidebar } from './EditorSidebar';
import { ElementToolbar } from './ElementToolbar';
import { EditorStatusBar } from './EditorStatusBar';
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
  toolbarProps: Omit<ComponentProps<typeof Toolbar>, 'sidebarVisible' | 'onToggleStructure'>;
  onInspectorWidthChange: (width: number) => void;
  onShowProjects: () => void;
  onTogglePreview: () => void;
  onZoomChange: (zoom: number) => void;
};

const EditorHeader = ({
  project,
  toolbarProps,
  onShowProjects,
  sidebarVisible,
  onToggleStructure
}: Pick<EditorWorkspaceProps, 'project' | 'toolbarProps' | 'onShowProjects'> &
  Pick<ComponentProps<typeof Toolbar>, 'sidebarVisible' | 'onToggleStructure'>) => {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const titleDraftRef = useRef<string | null>(null);
  const composingTitle = useRef(false);
  const commitTitle = useCallback((): void => {
    const title = titleDraftRef.current;
    if (title === null) return;
    useEditorStore.getState().updateProjectTitle(title);
    titleDraftRef.current = null;
    setTitleDraft(null);
  }, []);
  useLayoutEffect(() => registerPendingEdit({ flush: commitTitle, isComposing: () => composingTitle.current }), [commitTitle]);

  return <header className="app-header">
    <div className="brand-lockup">
      <button type="button" className="brand-mark brand-home-button" aria-label="К проектам" title="К проектам" onClick={onShowProjects}>M</button>
      <div>
        <span className="brand-name">MARKD</span>
        <h1 title={project.metadata.title} aria-label={project.metadata.title}>
          <input className="document-title-input" aria-label="Название документа" maxLength={120}
            value={titleDraft ?? project.metadata.title} spellCheck={false}
            onChange={(event) => { titleDraftRef.current = event.currentTarget.value; setTitleDraft(event.currentTarget.value); }}
            onBlur={() => { if (!composingTitle.current) commitTitle(); }}
            onCompositionStart={() => { composingTitle.current = true; }}
            onCompositionEnd={(event) => {
              composingTitle.current = false;
              titleDraftRef.current = event.currentTarget.value;
              setTitleDraft(event.currentTarget.value);
              if (document.activeElement !== event.currentTarget) commitTitle();
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                titleDraftRef.current = null;
                setTitleDraft(null);
                event.currentTarget.blur();
              }
              if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            }} />
        </h1>
      </div>
    </div>

    <Toolbar {...toolbarProps} sidebarVisible={sidebarVisible} onToggleStructure={onToggleStructure} />
  </header>;
};

const PreviewHeader = ({
  onTogglePreview
}: Pick<EditorWorkspaceProps, 'onTogglePreview'>) => (
  <header className="preview-header" aria-label="Панель предпросмотра">
    <span>Предпросмотр документа</span>
    <div>
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
  const [sidebarVisible, setSidebarVisible] = useState(() => window.innerWidth > 760);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const onChange = (): void => setSidebarVisible(!query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || renderMode === 'print') return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? shell.clientHeight : 1;
      const current = useEditorStore.getState().zoom;
      onZoomChange(Math.max(0.25, Math.min(2, current * Math.exp(-event.deltaY * unit * 0.002))));
    };
    shell.addEventListener('wheel', onWheel, { passive: false });
    return () => shell.removeEventListener('wheel', onWheel);
  }, [onZoomChange, renderMode]);
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
      ref={shellRef}
      className={`app-shell mode-${renderMode} ${isPreview ? 'preview-mode' : ''} ${!sidebarVisible ? 'sidebar-hidden' : ''}`}
      style={{ '--inspector-width': `${inspectorWidth}px` } as CSSProperties}
    >
      {renderMode === 'edit' ? (
        <EditorHeader project={project} toolbarProps={toolbarProps} onShowProjects={onShowProjects}
          sidebarVisible={sidebarVisible} onToggleStructure={() => setSidebarVisible(value => !value)} />
      ) : renderMode === 'preview' ? (
        <PreviewHeader onTogglePreview={onTogglePreview} />
      ) : null}

      {renderMode === 'edit' ? <ElementToolbar /> : null}
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
      {renderMode !== 'print' ? <EditorStatusBar zoom={zoom} isPreview={isPreview} onZoomChange={onZoomChange} onFit={fit} /> : null}
      {renderMode !== 'print' ? <OperationToast operation={operation} /> : null}
    </div>
  );
};
