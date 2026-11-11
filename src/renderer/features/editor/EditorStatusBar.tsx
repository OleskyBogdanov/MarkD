import { Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { UpdatesPanel } from '@/renderer/components/UpdatesPanel';
import { PageNavigator } from './PageNavigator';
import './editor-status-bar.css';

type EditorStatusBarProps = {
  readonly zoom: number;
  readonly isPreview: boolean;
  readonly onZoomChange: (zoom: number) => void;
  readonly onFit: (whole: boolean) => void;
};

export const EditorStatusBar = ({ zoom, isPreview, onZoomChange, onFit }: EditorStatusBarProps) => {
  const [pageError, setPageError] = useState('');
  return <footer className="editor-status-bar" aria-label="Нижняя панель документа">
    <PageNavigator onError={setPageError} editable={!isPreview} />
    <UpdatesPanel />
    <div className="zoom-controls" role="group" aria-label="Масштаб документа">
      <Button className="icon-button" variant="ghost" title="Уменьшить" aria-label="Уменьшить"
        disabled={zoom <= 0.25} onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}><ZoomOut size={16} aria-hidden="true" /></Button>
      <output aria-label="Текущий масштаб">{Math.round(zoom * 100)}%</output>
      <Button className="icon-button" variant="ghost" title="Увеличить" aria-label="Увеличить"
        disabled={zoom >= 2} onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}><ZoomIn size={16} aria-hidden="true" /></Button>
      <div className="fit-controls">
        <Button variant="ghost" title="По ширине" aria-label="По ширине" onClick={() => onFit(false)}>
          <MoveHorizontal size={16} aria-hidden="true" /><span>По ширине</span>
        </Button>
        <Button variant="ghost" title="Вся страница" aria-label="Вся страница" onClick={() => onFit(true)}>
          <Maximize size={16} aria-hidden="true" /><span>Вся страница</span>
        </Button>
      </div>
    </div>
    {pageError ? <div className="page-error" role="alert">{pageError}</div> : null}
  </footer>;
};
