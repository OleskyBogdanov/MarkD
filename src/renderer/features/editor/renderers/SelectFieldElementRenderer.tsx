import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { KpRect, KpSelectFieldElement, RenderMode } from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import { fontFamilyForId } from '@/renderer/domain/fontRegistry';

type SelectFieldElementRendererProps = {
  element: KpSelectFieldElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
  onValueChange: (value: string | null) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const SelectFieldElementRenderer = ({
  element,
  mode,
  rect,
  scale,
  selected,
  zoom,
  onSelect,
  onValueChange,
  onMoveStart,
  onResizeStart
}: SelectFieldElementRendererProps) => {
  const selectedOption = element.options.find((option) => option.id === element.selectedOptionId);
  const inputId = `canvas-${element.id}`;
  const style = {
    '--field-font-family': fontFamilyForId(element.style.fontId),
    '--field-font-size': `${element.style.fontSize * zoom}px`,
    '--field-label-color': element.style.labelColor,
    '--field-text-color': element.style.textColor,
    '--field-background': element.style.backgroundColor,
    '--field-border': element.style.borderColor,
    '--field-radius': `${element.style.borderRadius * zoom}px`
  } as React.CSSProperties;

  return (
    <ElementFrame
      className="select-field-element"
      mode={mode}
      rect={rect}
      scale={scale}
      selected={selected}
      testId="select-field-element"
      zIndex={element.zIndex}
      moveLabel="Переместить выпадающий список"
      resizeLabel="Изменить размер выпадающего списка"
      moveTestId="select-field-drag-handle"
      onSelect={onSelect}
      onMoveStart={onMoveStart}
      onResizeStart={onResizeStart}
    >
      <div className="document-field" style={style}>
        {mode === 'edit' ? <label htmlFor={inputId}>{element.label || 'Выпадающий список'}</label> : <span className="field-label">{element.label || '\u00a0'}</span>}
        <div className="field-control select-control">
          {mode === 'edit' ? (
            <select
              id={inputId}
              aria-label={element.label || 'Выпадающий список'}
              value={element.selectedOptionId ?? ''}
              onChange={(event) => onValueChange(event.currentTarget.value || null)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onFocus={onSelect}
            >
              <option value="">{element.placeholder}</option>
              {element.options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
            </select>
          ) : (
            <div className={`field-presentation ${selectedOption ? '' : 'is-placeholder'}`}>
              <span>{selectedOption?.label || element.placeholder || '\u00a0'}</span>
              <ChevronDown aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </ElementFrame>
  );
};
