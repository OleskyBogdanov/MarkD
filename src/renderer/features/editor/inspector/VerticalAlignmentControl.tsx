import { AlignVerticalDistributeCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from 'lucide-react';
import type { VerticalAlign } from '@/renderer/domain/model';

const OPTIONS = [
  ['top', AlignVerticalJustifyStart, 'Сверху'],
  ['middle', AlignVerticalDistributeCenter, 'По середине'],
  ['bottom', AlignVerticalJustifyEnd, 'Снизу']
] as const;

export const VerticalAlignmentControl = ({ value, onChange }: {
  readonly value: VerticalAlign;
  readonly onChange: (value: VerticalAlign) => void;
}) => (
  <div className="segmented-control" role="group" aria-label="Вертикальное выравнивание">
    {OPTIONS.map(([align, Icon, label]) => (
      <button type="button" key={align} aria-label={label} title={label} aria-pressed={value === align}
        className={value === align ? 'active' : ''} onClick={() => onChange(align)}>
        <Icon size={15} aria-hidden="true" />
      </button>
    ))}
  </div>
);
