import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { KpRect, RenderMode } from '@/renderer/domain/model';
import { EditorOverlay } from './EditorOverlay';

type ElementFrameProps = {
  children: ReactNode;
  chrome?: ReactNode;
  className: string;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  controlsInside?: boolean;
  testId: string;
  zIndex: number;
  moveLabel: string;
  resizeLabel?: string;
  moveTestId?: string;
  hasOverflow?: boolean;
  resizable?: boolean;
  onSelect: () => void;
  onDoubleClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const ElementFrame = ({
  children,
  chrome,
  className,
  mode,
  rect,
  scale,
  selected,
  controlsInside = false,
  testId,
  zIndex,
  moveLabel,
  resizeLabel,
  moveTestId,
  hasOverflow,
  resizable = true,
  onSelect,
  onDoubleClick,
  onMoveStart,
  onResizeStart
}: ElementFrameProps) => (
  <div
    className={`canvas-element ${className} ${mode === 'edit' && selected ? 'selected' : ''}`}
    data-testid={testId}
    data-render-mode={mode}
    style={{
      left: `${rect.x * scale}px`,
      top: `${rect.y * scale}px`,
      width: `${rect.width * scale}px`,
      height: `${rect.height * scale}px`
    } as CSSProperties}
    onClick={mode === 'edit' ? onSelect : undefined}
    onDoubleClick={mode === 'edit' ? onDoubleClick : undefined}
  >
    <div className="canvas-element-content" style={{ zIndex: zIndex + 2 }}>
      {children}
    </div>
    <EditorOverlay
      mode={mode}
      selected={selected}
      controlsInside={controlsInside}
      moveLabel={moveLabel}
      resizeLabel={resizeLabel}
      moveTestId={moveTestId}
      hasOverflow={hasOverflow}
      onMoveStart={onMoveStart}
      onResizeStart={resizable ? onResizeStart : undefined}
    >
      {chrome}
    </EditorOverlay>
  </div>
);
