import { useEffect, useState } from 'react';

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

type ColorControlProps = {
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export const ColorControl = ({ disabled = false, label, value, onChange }: ColorControlProps) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (): void => {
    if (HEX_COLOR.test(draft)) onChange(draft.toLowerCase());
    else setDraft(value);
  };

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
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
      </span>
    </label>
  );
};
