import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { GripVertical, TriangleAlert } from 'lucide-react';
import type { RenderMode } from '@/renderer/domain/model';

type EditorOverlayProps = {
  mode: RenderMode;
  selected: boolean;
  moveLabel: string;
  resizeLabel?: string;
  moveTestId?: string;
  hasOverflow?: boolean;
  children?: ReactNode;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const EditorOverlay = ({
  mode,
  selected,
  moveLabel,
  resizeLabel = 'Изменить размер элемента',
  moveTestId,
  hasOverflow = false,
  children,
  onMoveStart,
  onResizeStart
}: EditorOverlayProps) => {
  if (mode !== 'edit') return null;

  return (
    <div className="editor-overlay" data-testid="editor-overlay" aria-hidden={!selected && !hasOverflow}>
      {selected ? (
        <>
          <button
            type="button"
            className="element-drag-handle"
            data-testid={moveTestId}
            aria-label={moveLabel}
            title={moveLabel}
            onPointerDown={onMoveStart}
            onClick={(event) => event.stopPropagation()}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          {onResizeStart ? (
            <button
              type="button"
              className="resize-handle"
              aria-label={resizeLabel}
              title={resizeLabel}
              onPointerDown={onResizeStart}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
          {children}
        </>
      ) : null}
      {hasOverflow ? (
        <span className="overflow-warning" role="status" title="Текст не помещается в границы элемента">
          <TriangleAlert size={13} aria-hidden="true" />
          <span className="sr-only">Текст не помещается в границы элемента</span>
        </span>
      ) : null}
    </div>
  );
};
