import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { registerPendingEdit } from '@/renderer/domain/pendingEdits';

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

type ColorControlProps = {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export const ColorControl = ({ disabled = false, label, value, onChange }: ColorControlProps) => {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  useEffect(() => setDraft(value), [value]);

  const commit = useCallback((): void => {
    if (!HEX_COLOR.test(draft)) setDraft(value);
    else if (draft.toLowerCase() !== value.toLowerCase()) onChange(draft.toLowerCase());
  }, [draft, onChange, value]);
  useLayoutEffect(() => registerPendingEdit({ flush: commit, isComposing: () => composing.current }), [commit]);

  return (
    <label className={`color-control${disabled ? ' is-disabled' : ''}`}>
      {label}
      <span>
        <input disabled={disabled} type="color" value={value.slice(0, 7)} aria-label={`${label}: выбор цвета`} onChange={(event) => onChange(event.currentTarget.value)} />
        <input
          disabled={disabled}
          type="text"
          value={draft}
          aria-label={`${label}: HEX`}
          maxLength={9}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      </span>
    </label>
  );
};
