import { Trash2 } from 'lucide-react';
import type { KpRect, KpTextFieldElement } from '@/renderer/domain/model';
import { DOCUMENT_ICON_LICENSE_URL } from '@/renderer/domain/iconRegistry';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { FontSelect } from '@/renderer/components/ui/FontSelect';
import { IconPicker } from '@/renderer/components/ui/IconPicker';
import { TextPlacementControl } from '@/renderer/components/ui/TextPlacementControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { GeometryFields } from './GeometryFields';
import { InspectorSection } from './InspectorSection';
import { readNumber } from './utils';

type TextFieldInspectorProps = {
  element: KpTextFieldElement;
  pageId: string;
};

export const TextFieldInspector = ({ element, pageId }: TextFieldInspectorProps) => {
  const updateRect = (rect: KpRect): void => {
    useEditorStore.getState().updateElementRect(pageId, element.id, rect);
  };
  const update = (patch: Parameters<ReturnType<typeof useEditorStore.getState>['updateTextField']>[2]): void => {
    useEditorStore.getState().updateTextField(pageId, element.id, patch);
  };

  return (
    <section className="inspector-panel" aria-label="Свойства текстового поля">
      <h3 className="sr-only">Текстовое поле</h3>
      <InspectorSection title="Содержание" summary={element.label || element.value || 'Пусто'} defaultOpen>
        <div className="inspector-block">
        <label className="toggle-row">
          <input type="checkbox" checked={element.showLabel} onChange={(event) => update({ showLabel: event.currentTarget.checked })} />
          <span>Показывать подпись</span>
        </label>
        <label>
          Подпись
          <input disabled={!element.showLabel} value={element.label} onChange={(event) => update({ label: event.currentTarget.value })} />
        </label>
        <label>
          Значение
          <BufferedTextarea
            className="text-field-value"
            value={element.value}
            rows={2}
            onCommit={(value) => update({ value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={element.showPlaceholder} onChange={(event) => update({ showPlaceholder: event.currentTarget.checked })} />
          <span>Показывать placeholder</span>
        </label>
        <label>
          Placeholder
          <input disabled={!element.showPlaceholder} value={element.placeholder} onChange={(event) => update({ placeholder: event.currentTarget.value })} />
        </label>
        <IconPicker value={element.iconName} onChange={(iconName) => update({ iconName })} />
        <span className="control-attribution" data-license-url={DOCUMENT_ICON_LICENSE_URL}>Lucide · ISC/MIT</span>
        </div>
      </InspectorSection>

      <InspectorSection title="Текст" summary={`${element.style.fontSize} px`} defaultOpen>
        <div className="inspector-block">
        <label>
          Шрифт
          <FontSelect value={element.style.fontId} onChange={(fontId) => update({ style: { fontId } })} />
        </label>
        <label>
          Размер текста, px
          <input
            type="number"
            min={8}
            max={32}
            value={element.style.fontSize}
            onChange={(event) => update({ style: { fontSize: readNumber(event.currentTarget.value, element.style.fontSize) } })}
          />
        </label>
        <span className="inspector-field-label">Расположение текста</span>
        <TextPlacementControl
          horizontal={element.textAlign}
          vertical={element.verticalAlign}
          onHorizontalChange={(textAlign) => update({ textAlign })}
          onVerticalChange={(verticalAlign) => update({ verticalAlign })}
        />
        </div>
      </InspectorSection>

      <InspectorSection title="Цвета" summary={element.style.backgroundTransparent ? 'Прозрачный фон' : element.style.backgroundColor}>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => update({ style: { textColor } })} />
          <ColorControl label="Подпись" value={element.style.labelColor} onChange={(labelColor) => update({ style: { labelColor } })} />
          <ColorControl label="Иконка" value={element.style.iconColor} onChange={(iconColor) => update({ style: { iconColor } })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => update({ style: { backgroundColor } })} />
          <ColorControl label="Граница" value={element.style.borderColor} onChange={(borderColor) => update({ style: { borderColor } })} />
        </div>

        <div className="inspector-block appearance-toggles">
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.backgroundTransparent} onChange={(event) => update({ style: { backgroundTransparent: event.currentTarget.checked } })} />
            <span>Прозрачный фон</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.borderVisible} onChange={(event) => update({ style: { borderVisible: event.currentTarget.checked } })} />
            <span>Показывать границу</span>
          </label>
        </div>
      </InspectorSection>

      <InspectorSection title="Положение" summary={`${element.rect.width} × ${element.rect.height} мм`}>
        <GeometryFields rect={element.rect} onChange={updateRect} />
      </InspectorSection>
      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить поле
      </button>
    </section>
  );
};
