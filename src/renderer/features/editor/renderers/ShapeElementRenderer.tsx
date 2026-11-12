import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { KpRect, KpShapeElement, RenderMode } from '@/renderer/domain/model';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import './shape-element.css';
import { ElementFrame } from './ElementFrame';
import { fontFamilyForId } from '@/renderer/domain/fontRegistry';
import { useTextOverflow } from '@/renderer/components/ui/useTextOverflow';

type ShapeElementRendererProps = {
  element: KpShapeElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
  onTextChange: (value: string) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

const dashArray = (style: KpShapeElement['style']['strokeStyle']): string | undefined => {
  if (style === 'dashed') return '10 7';
  if (style === 'dotted') return '2 6';
  return undefined;
};

export const ShapeElementRenderer = ({
  element,
  mode,
  rect,
  scale,
  selected,
  zoom,
  onSelect,
  onTextChange,
  onMoveStart,
  onResizeStart
}: ShapeElementRendererProps) => {
  const textRef = useRef<HTMLTextAreaElement | HTMLDivElement>(null);
  const [editingText, setEditingText] = useState(false);
  const supportsText = element.shape !== 'line';
  const hasOverflow = useTextOverflow(textRef, mode === 'edit' && supportsText, element, rect);
  const fill = element.style.fillTransparent || element.shape === 'line' ? 'none' : element.style.fillColor;
  const strokeWidth = element.style.strokeWidth * zoom;
  const cornerRadiusX = Math.min(49, (element.style.cornerRadius * zoom * 100) / Math.max(rect.width * scale, 1));
  const cornerRadiusY = Math.min(49, (element.style.cornerRadius * zoom * 100) / Math.max(rect.height * scale, 1));
  const commonStyle = {
    fill,
    stroke: element.style.strokeColor,
    strokeWidth,
    strokeDasharray: dashArray(element.style.strokeStyle),
    vectorEffect: 'non-scaling-stroke'
  } as CSSProperties;
  const textStyle = {
    fontFamily: fontFamilyForId(element.textStyle.fontId),
    fontSize: `${element.textStyle.fontSize * zoom}px`,
    fontWeight: element.textStyle.bold ? 700 : 400,
    fontStyle: element.textStyle.italic ? 'italic' : 'normal',
    textAlign: element.textStyle.align,
    color: element.textStyle.color,
    '--shape-text-padding': `${8 * zoom}px`
  } as CSSProperties;

  useEffect(() => {
    if (mode !== 'edit' || !supportsText) setEditingText(false);
  }, [mode, supportsText]);

  useEffect(() => {
    if (!editingText || !(textRef.current instanceof HTMLTextAreaElement)) return;
    textRef.current.focus();
    textRef.current.select();
  }, [editingText]);

  const startTextEditing = (event: ReactMouseEvent<HTMLElement>): void => {
    if (!supportsText || mode !== 'edit') return;
    event.stopPropagation();
    onSelect();
    setEditingText(true);
  };

  const stopTextEditingOnEscape = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.currentTarget.blur();
    event.currentTarget.closest<HTMLElement>('.shape-element')?.focus();
  };

  const startTextEditingFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || !selected || !supportsText) return;
    if (event.key !== 'Enter' && event.key !== 'F2') return;
    event.preventDefault();
    event.stopPropagation();
    setEditingText(true);
  };

  return (
    <ElementFrame
      className="shape-element"
      mode={mode}
      rect={rect}
      scale={scale}
      selected={selected}
      testId="shape-element"
      zIndex={element.zIndex}
      moveLabel="Переместить фигуру"
      resizeLabel="Изменить размер фигуры"
      moveTestId="shape-drag-handle"
      hasOverflow={hasOverflow}
      tabIndex={supportsText && selected ? 0 : undefined}
      ariaLabel={supportsText ? 'Фигура: Enter или F2 для редактирования текста' : undefined}
      onSelect={onSelect}
      onKeyDown={startTextEditingFromKeyboard}
      onDoubleClick={supportsText ? startTextEditing : undefined}
      onMoveStart={onMoveStart}
      onResizeStart={onResizeStart}
    >
      <svg className="document-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {element.shape === 'rectangle' ? <rect x="1" y="1" width="98" height="98" rx={cornerRadiusX} ry={cornerRadiusY} style={commonStyle} /> : null}
        {element.shape === 'ellipse' ? <ellipse cx="50" cy="50" rx="49" ry="49" style={commonStyle} /> : null}
        {element.shape === 'triangle' ? <polygon points="50,1 99,99 1,99" style={commonStyle} /> : null}
        {element.shape === 'line' ? <line x1="1" y1="50" x2="99" y2="50" style={commonStyle} /> : null}
      </svg>
      {supportsText ? (
        <div className={`shape-text-layer${editingText ? ' is-editing' : ''}`}>
          {mode === 'edit' && editingText ? (
            <BufferedTextarea
              ref={textRef as React.RefObject<HTMLTextAreaElement>}
              className="shape-text-editor"
              aria-label="Текст фигуры"
              value={element.text}
              style={textStyle}
              onCommit={onTextChange}
              onBlur={() => setEditingText(false)}
              onKeyDown={stopTextEditingOnEscape}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          ) : (
            <div
              ref={textRef as React.RefObject<HTMLDivElement>}
              className="shape-text-presentation"
              data-overflow-text
              style={textStyle}
            >
              {element.text}
            </div>
          )}
        </div>
      ) : null}
    </ElementFrame>
  );
};
