import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '@/renderer/domain/model';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';
import { useEditorStore } from '@/renderer/store/useEditorStore';

type Props = {
  readonly ariaLabel: string;
  readonly className: string;
  readonly max: number;
  readonly min: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly pixelsPerUnit: number;
  readonly style: CSSProperties;
  readonly testId: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

export const TableResizeHandle = ({ ariaLabel, className, max, min, orientation, pixelsPerUnit, style, testId, value, onChange }: Props) => {
  const dragRef = useRef<{ pointerPosition: number; value: number; pixelsPerUnit: number } | null>(null);
  useEffect(() => () => {
    if (dragRef.current) useEditorStore.getState().endHistoryTransaction();
  }, []);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    flushPendingEdits();
    useEditorStore.getState().beginHistoryTransaction();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerPosition: orientation === 'vertical' ? event.clientX : event.clientY, value,
      pixelsPerUnit: pixelsPerUnit * event.currentTarget.currentCSSZoom
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const pointerPosition = orientation === 'vertical' ? event.clientX : event.clientY;
    onChange(clamp(drag.value + (pointerPosition - drag.pointerPosition) / Math.max(0.01, drag.pixelsPerUnit), min, max));
  };
  const stopPointerDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    useEditorStore.getState().endHistoryTransaction();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const decreases = orientation === 'vertical' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
    const increases = orientation === 'vertical' ? event.key === 'ArrowRight' : event.key === 'ArrowDown';
    if (!decreases && !increases) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(clamp(value + (increases ? event.shiftKey ? 5 : 1 : event.shiftKey ? -5 : -1), min, max));
  };
  return (
    <div aria-label={ariaLabel} aria-orientation={orientation} aria-valuemax={Math.round(max)}
      aria-valuemin={Math.round(min)} aria-valuenow={Math.round(value)} className={className}
      data-testid={testId} role="separator" style={style} tabIndex={0}
      onKeyDown={onKeyDown} onPointerCancel={stopPointerDrag} onLostPointerCapture={stopPointerDrag} onPointerDown={onPointerDown}
      onPointerMove={onPointerMove} onPointerUp={stopPointerDrag} />
  );
};
