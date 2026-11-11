import { Bold, Italic } from 'lucide-react';
import type { KpTextElement } from '@/renderer/domain/model';
import { fontSupportsItalic } from '@/renderer/domain/fontRegistry';
import { BufferedInput } from '@/renderer/components/ui/BufferedTextControl';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { FontSelect } from '@/renderer/components/ui/FontSelect';
import { AlignmentControl } from './AlignmentControl';
import { readNumber } from './utils';

type TextFormat = Pick<KpTextElement['style'], 'fontId' | 'fontSize' | 'color'> &
  Partial<Pick<KpTextElement['style'], 'bold' | 'italic' | 'align'>>;

type TextFormatControlsProps = {
  readonly value: TextFormat;
  readonly maxFontSize?: number;
  readonly sizeLabel?: string;
  readonly mixed?: readonly (keyof TextFormat)[];
  readonly onChange: (patch: Partial<TextFormat>) => void;
};

export const TextFormatControls = ({
  value,
  maxFontSize = 72,
  sizeLabel = 'Размер, px',
  mixed = [],
  onChange
}: TextFormatControlsProps) => (
  <div className="text-format-controls" role="group" aria-label="Форматирование текста">
    <label className="format-font">
      <span>Шрифт</span>
      <FontSelect value={value.fontId} onChange={(fontId) => onChange({
        fontId,
        ...(value.italic !== undefined && !fontSupportsItalic(fontId) ? { italic: false } : {})
      })} />
    </label>
    <label className="format-size">
      <span>{sizeLabel}</span>
      <BufferedInput
        type="number"
        min={8}
        max={maxFontSize}
        value={mixed.includes('fontSize') ? '' : String(value.fontSize)}
        placeholder={mixed.includes('fontSize') ? 'Смешано' : undefined}
        onCommit={(size) => onChange({ fontSize: Math.max(8, Math.min(maxFontSize, readNumber(size, value.fontSize))) })}
      />
    </label>
    {value.bold !== undefined || value.italic !== undefined ? (
      <div className="segmented-control" role="group" aria-label="Начертание">
        {value.bold !== undefined ? (
          <button type="button" aria-label="Полужирный" title="Полужирный" aria-pressed={mixed.includes('bold') ? 'mixed' : value.bold}
            className={!mixed.includes('bold') && value.bold ? 'active' : ''} onClick={() => onChange({ bold: mixed.includes('bold') || !value.bold })}>
            <Bold size={16} aria-hidden="true" />
          </button>
        ) : null}
        {value.italic !== undefined ? (
          <button type="button" aria-label="Курсив" title={fontSupportsItalic(value.fontId) ? 'Курсив' : 'У этой гарнитуры нет курсива'}
            aria-pressed={mixed.includes('italic') ? 'mixed' : value.italic} disabled={!fontSupportsItalic(value.fontId)}
            className={!mixed.includes('italic') && value.italic ? 'active' : ''} onClick={() => onChange({ italic: mixed.includes('italic') || !value.italic })}>
            <Italic size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    ) : null}
    <ColorControl label="Цвет текста" value={value.color} onChange={(color) => onChange({ color })} />
    {value.align !== undefined ? <AlignmentControl value={value.align} onChange={(align) => onChange({ align })} /> : null}
  </div>
);
