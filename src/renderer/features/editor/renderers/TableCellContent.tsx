import { useState, type CSSProperties, type PointerEvent } from 'react';
import type { RenderMode, VerticalAlign } from '@/renderer/domain/model';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { useAutoSizeTextarea } from '@/renderer/components/ui/useAutoSizeTextarea';

const verticalContentAlign = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

type Props = {
  readonly ariaLabel: string;
  readonly mode: RenderMode;
  readonly style: CSSProperties;
  readonly value: string;
  readonly verticalAlign: VerticalAlign;
  readonly onChange: (value: string) => void;
  readonly onFocus: () => void;
  readonly onSelect: (event: PointerEvent<HTMLElement>, editing: boolean) => void;
  readonly onMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onStop: (event: PointerEvent<HTMLElement>) => void;
};

export const TableCellContent = ({ ariaLabel, mode, style, value, verticalAlign, onChange, onFocus, onSelect, onMove, onStop }: Props) => {
  const autoSize = useAutoSizeTextarea();
  const [editing, setEditing] = useState(false);
  return (
    <div className="table-cell-content" style={{ justifyContent: verticalContentAlign[verticalAlign] }}>
      {mode === 'edit' ? (
        <BufferedTextarea
          ref={autoSize.ref}
          aria-label={ariaLabel}
          rows={1}
          value={value}
          style={style}
          readOnly={!editing}
          tabIndex={-1}
          onCommit={onChange}
          onInput={autoSize.resize}
          onPointerDown={(event) => onSelect(event, editing)}
          onPointerMove={onMove}
          onPointerUp={onStop}
          onPointerCancel={onStop}
          onLostPointerCapture={onStop}
          onDoubleClick={(event) => {
            event.stopPropagation();
            setEditing(true);
            event.currentTarget.focus({ preventScroll: true });
          }}
          onFocus={() => { setEditing(true); onFocus(); }}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
              event.currentTarget.closest<HTMLElement>('th, td')?.focus();
            }
          }}
        />
      ) : <span style={style}>{value || '\u00a0'}</span>}
    </div>
  );
};
