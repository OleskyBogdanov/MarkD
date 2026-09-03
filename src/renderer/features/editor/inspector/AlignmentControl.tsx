import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import type { TextAlign } from '@/renderer/domain/model';

type AlignmentControlProps = {
  value: TextAlign;
  onChange: (value: TextAlign) => void;
};

const ALIGNMENT_OPTIONS = [
  ['left', AlignLeft, 'По левому краю'],
  ['center', AlignCenter, 'По центру'],
  ['right', AlignRight, 'По правому краю']
] as const;

export const AlignmentControl = ({ value, onChange }: AlignmentControlProps) => (
  <div className="segmented-control segmented-control-wide" role="group" aria-label="Выравнивание текста">
    {ALIGNMENT_OPTIONS.map(([align, Icon, label]) => (
      <button
        type="button"
        key={align}
        className={value === align ? 'active' : ''}
        aria-label={label}
        aria-pressed={value === align}
        title={label}
        onClick={() => onChange(align)}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    ))}
  </div>
);
