import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { KpRect, KpTextElement, RenderMode } from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';

type TextElementRendererProps = {
  element: KpTextElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
  onChange: (value: string) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const TextElementRenderer = ({
  element,
  mode,
  rect,
  scale,
  selected,
  zoom,
  onSelect,
  onChange,
  onMoveStart,
  onResizeStart
}: TextElementRendererProps) => {
  const contentRef = useRef<HTMLTextAreaElement | HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    if (mode !== 'edit' || !contentRef.current) {
      setHasOverflow(false);
      return;
    }
    const node = contentRef.current;
    setHasOverflow(node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
  }, [element.text, element.style, mode, rect.height, rect.width, zoom]);

  const contentStyle = {
    fontFamily: element.style.fontFamily,
    fontSize: `${element.style.fontSize * zoom}px`,
    fontWeight: element.style.bold ? 700 : 400,
    fontStyle: element.style.italic ? 'italic' : 'normal',
    textAlign: element.style.align,
    color: element.style.color
  } as const;

  return (
    <ElementFrame
      className="text-element"
      mode={mode}
      rect={rect}
      scale={scale}
      selected={selected}
      testId="text-element"
      zIndex={element.zIndex}
      moveLabel="Переместить текстовый блок"
      resizeLabel="Изменить размер текстового блока"
      moveTestId="text-drag-handle"
      hasOverflow={hasOverflow}
      onSelect={onSelect}
      onMoveStart={onMoveStart}
      onResizeStart={onResizeStart}
    >
      {mode === 'edit' ? (
        <BufferedTextarea
          ref={contentRef as React.RefObject<HTMLTextAreaElement>}
          className="document-text editor-text"
          aria-label="Текст на странице"
          value={element.text}
          style={contentStyle}
          onCommit={onChange}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onFocus={onSelect}
        />
      ) : (
        <div ref={contentRef as React.RefObject<HTMLDivElement>} className="document-text presentation-text" style={contentStyle}>
          {element.text || '\u00a0'}
        </div>
      )}
    </ElementFrame>
  );
};
