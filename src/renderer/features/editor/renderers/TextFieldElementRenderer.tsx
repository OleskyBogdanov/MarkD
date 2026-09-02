import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { KpRect, KpTextFieldElement, RenderMode } from '@/renderer/domain/model';
import { DOCUMENT_ICON_REGISTRY } from '@/renderer/domain/iconRegistry';
import { ElementFrame } from './ElementFrame';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { useAutoSizeTextarea } from '@/renderer/components/ui/useAutoSizeTextarea';

const verticalContentAlign = {
  top: 'start',
  middle: 'center',
  bottom: 'end'
} as const;

type TextFieldElementRendererProps = {
  element: KpTextFieldElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
  onValueChange: (value: string) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const TextFieldElementRenderer = ({
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
}: TextFieldElementRendererProps) => {
  const Icon = element.iconName ? DOCUMENT_ICON_REGISTRY[element.iconName] : null;
  const inputId = `canvas-${element.id}`;
  const autoSize = useAutoSizeTextarea();
  const style = {
    '--field-font-size': `${element.style.fontSize * zoom}px`,
    '--field-label-color': element.style.labelColor,
    '--field-text-color': element.style.textColor,
    '--field-icon-color': element.style.iconColor,
    '--field-background': element.style.backgroundTransparent ? 'transparent' : element.style.backgroundColor,
    '--field-border': element.style.borderColor,
    '--field-border-width': element.style.borderVisible ? `${zoom}px` : '0px',
    '--field-radius': `${element.style.borderRadius * zoom}px`
  } as React.CSSProperties;
  const visiblePlaceholder = element.showPlaceholder ? element.placeholder : '';
  const preventPlainEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) event.preventDefault();
  };

  return (
    <ElementFrame
      className={`text-field-element ${Icon ? 'has-leading-icon' : ''}`}
      mode={mode}
      rect={rect}
      scale={scale}
      selected={selected}
      testId="text-field-element"
      zIndex={element.zIndex}
      moveLabel="Переместить текстовое поле"
      resizeLabel="Изменить размер текстового поля"
      moveTestId="text-field-drag-handle"
      onSelect={onSelect}
      onMoveStart={onMoveStart}
      onResizeStart={onResizeStart}
    >
      <div className={`document-field ${element.showLabel ? '' : 'without-label'}`} style={style}>
        {element.showLabel
          ? mode === 'edit'
            ? <label htmlFor={inputId}>{element.label || 'Текстовое поле'}</label>
            : <span className="field-label">{element.label || '\u00a0'}</span>
          : null}
        <div className="field-control">
          {Icon ? <span className="field-leading" aria-hidden="true"><Icon /></span> : null}
          {mode === 'edit' ? (
            <BufferedTextarea
              ref={autoSize.ref}
              id={inputId}
              aria-label={element.label || 'Текстовое поле'}
              value={element.value}
              placeholder={visiblePlaceholder}
              rows={1}
              style={{
                alignSelf: verticalContentAlign[element.verticalAlign],
                textAlign: element.textAlign
              }}
              onCommit={onValueChange}
              onInput={autoSize.resize}
              onKeyDown={preventPlainEnter}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onFocus={onSelect}
            />
          ) : (
            <div
              className={`field-presentation text-field-presentation ${!element.value && visiblePlaceholder ? 'is-placeholder' : ''}`}
              style={{
                alignContent: verticalContentAlign[element.verticalAlign],
                textAlign: element.textAlign
              }}
            >
              {element.value || visiblePlaceholder || '\u00a0'}
            </div>
          )}
        </div>
      </div>
    </ElementFrame>
  );
};
