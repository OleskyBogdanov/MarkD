import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
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
  tabIndex?: number;
  ariaLabel?: string;
  onSelect: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
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
  tabIndex,
  ariaLabel,
  onSelect,
  onKeyDown,
  onDoubleClick,
  onMoveStart,
  onResizeStart
}: ElementFrameProps) => (
  <div
    className={`canvas-element ${className} ${mode === 'edit' && selected ? 'selected' : ''}`}
    data-testid={testId}
    data-render-mode={mode}
    tabIndex={mode === 'edit' ? tabIndex : undefined}
    role={ariaLabel && mode === 'edit' ? 'group' : undefined}
    aria-label={mode === 'edit' ? ariaLabel : undefined}
    style={{
      left: `${rect.x * scale}px`,
      top: `${rect.y * scale}px`,
      width: `${rect.width * scale}px`,
      height: `${rect.height * scale}px`
    } as CSSProperties}
    onPointerDown={mode === 'edit' ? onSelect : undefined}
    onDoubleClick={mode === 'edit' ? onDoubleClick : undefined}
    onKeyDown={mode === 'edit' ? onKeyDown : undefined}
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
