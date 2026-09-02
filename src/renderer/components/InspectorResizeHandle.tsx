import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

type InspectorResizeHandleProps = {
  width: number;
  onChange: (width: number) => void;
};

const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 560;
const MIN_CANVAS_WIDTH = 420;
const DEFAULT_INSPECTOR_WIDTH = 340;

const availableMaxWidth = (): number =>
  Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, window.innerWidth - MIN_CANVAS_WIDTH));

const clampWidth = (width: number): number =>
  Math.round(Math.min(availableMaxWidth(), Math.max(MIN_INSPECTOR_WIDTH, width)));

export const InspectorResizeHandle = ({ width, onChange }: InspectorResizeHandleProps) => {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const currentDrag = drag.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    onChange(clampWidth(currentDrag.startWidth + currentDrag.startX - event.clientX));
  };

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onChange(clampWidth(width + (event.key === 'ArrowLeft' ? 16 : -16)));
  };

  return (
    <div
      className="inspector-resizer"
      role="separator"
      aria-label="Изменить ширину правой панели"
      aria-orientation="vertical"
      aria-valuemin={MIN_INSPECTOR_WIDTH}
      aria-valuemax={availableMaxWidth()}
      aria-valuenow={width}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину панели. Двойной щелчок сбрасывает ширину."
      onDoubleClick={() => onChange(clampWidth(DEFAULT_INSPECTOR_WIDTH))}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
    />
  );
};
