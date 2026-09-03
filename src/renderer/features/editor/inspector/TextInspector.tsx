import { Bold, Italic, Trash2 } from 'lucide-react';
import type { KpRect, KpTextElement } from '@/renderer/domain/model';
import { fontSupportsItalic } from '@/renderer/domain/fontRegistry';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { FontSelect } from '@/renderer/components/ui/FontSelect';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { AlignmentControl } from './AlignmentControl';
import { GeometryFields } from './GeometryFields';
import { InspectorSection } from './InspectorSection';
import { readNumber } from './utils';

type TextInspectorProps = {
  element: KpTextElement;
  pageId: string;
};

export const TextInspector = ({ element, pageId }: TextInspectorProps) => {
  const updateRect = (rect: KpRect): void => {
    useEditorStore.getState().updateElementRect(pageId, element.id, rect);
  };

  return (
    <section className="inspector-panel" aria-label="Свойства текста">
      <h3 className="sr-only">Текст</h3>
      <InspectorSection title="Содержание" summary={element.text || 'Пусто'} defaultOpen>
        <div className="inspector-block">
          <label>
            Текст
            <BufferedTextarea
              value={element.text}
              rows={5}
              onCommit={(value) => useEditorStore.getState().updateText(pageId, element.id, value)}
            />
          </label>
        </div>
      </InspectorSection>

      <InspectorSection title="Оформление" summary={`${element.style.fontSize} px`} defaultOpen>
        <div className="inspector-block">
        <label>
          Шрифт
          <FontSelect
            value={element.style.fontId}
            onChange={(fontId) => useEditorStore.getState().updateTextStyle(pageId, element.id, {
              fontId,
              italic: fontSupportsItalic(fontId) ? element.style.italic : false
            })}
          />
        </label>

        <div className="type-controls">
          <label>
            Размер, px
            <input
              type="number"
              value={element.style.fontSize}
              min={8}
              max={72}
              onChange={(event) => useEditorStore.getState().updateTextStyle(pageId, element.id, {
                fontSize: readNumber(event.currentTarget.value, element.style.fontSize)
              })}
            />
          </label>
          <div className="segmented-control" aria-label="Начертание">
            <button
              type="button"
              className={element.style.bold ? 'active' : ''}
              aria-label="Полужирный"
              aria-pressed={element.style.bold}
              title="Полужирный"
              onClick={() => useEditorStore.getState().updateTextStyle(pageId, element.id, { bold: !element.style.bold })}
            >
              <Bold size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={element.style.italic ? 'active' : ''}
              aria-label="Курсив"
              aria-pressed={element.style.italic}
              disabled={!fontSupportsItalic(element.style.fontId)}
              title={fontSupportsItalic(element.style.fontId) ? 'Курсив' : 'У этой гарнитуры нет курсива'}
              onClick={() => useEditorStore.getState().updateTextStyle(pageId, element.id, { italic: !element.style.italic })}
            >
              <Italic size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <AlignmentControl
          value={element.style.align}
          onChange={(align) => useEditorStore.getState().updateTextStyle(pageId, element.id, { align })}
        />
        <ColorControl
          label="Цвет текста"
          value={element.style.color}
          onChange={(color) => useEditorStore.getState().updateTextStyle(pageId, element.id, { color })}
        />
        </div>
      </InspectorSection>

      <InspectorSection title="Положение" summary={`${element.rect.width} × ${element.rect.height} мм`}>
        <GeometryFields rect={element.rect} onChange={updateRect} />
      </InspectorSection>

      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить текст
      </button>
    </section>
  );
};
