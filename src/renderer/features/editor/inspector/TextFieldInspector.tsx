import { Trash2 } from 'lucide-react';
import type { KpTextFieldElement } from '@/renderer/domain/model';
import { DOCUMENT_ICON_LICENSE_URL } from '@/renderer/domain/iconRegistry';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { IconPicker } from '@/renderer/components/ui/IconPicker';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { InspectorSection } from './InspectorSection';
import { TextFormatControls } from './TextFormatControls';
import { AlignmentControl } from './AlignmentControl';
import { VerticalAlignmentControl } from './VerticalAlignmentControl';

type TextFieldInspectorProps = {
  element: KpTextFieldElement;
  pageId: string;
};

export const TextFieldInspector = ({ element, pageId }: TextFieldInspectorProps) => {
  const update = (patch: Parameters<ReturnType<typeof useEditorStore.getState>['updateTextField']>[2]): void => {
    useEditorStore.getState().updateTextField(pageId, element.id, patch);
  };

  return (
    <section className="inspector-panel" aria-label="Свойства текстового поля">
      <h3 className="sr-only">Текстовое поле</h3>
      <TextFormatControls value={{ ...element.style, color: element.style.textColor }} maxFontSize={32} sizeLabel="Размер текста, px"
        onChange={({ color, ...style }) => update({ style: { ...style, ...(color === undefined ? {} : { textColor: color }) } })} />
      <AlignmentControl value={element.textAlign} onChange={(textAlign) => update({ textAlign })} />
      <VerticalAlignmentControl value={element.verticalAlign} onChange={(verticalAlign) => update({ verticalAlign })} />
      <InspectorSection title="Поле" summary={element.label || element.value || 'Пусто'} defaultOpen>
        <div className="inspector-block">
        <label className="toggle-row">
          <input type="checkbox" checked={element.showLabel} onChange={(event) => update({ showLabel: event.currentTarget.checked })} />
          <span>Показывать подпись</span>
        </label>
        <label>
          Подпись
          <input disabled={!element.showLabel} value={element.label} onChange={(event) => update({ label: event.currentTarget.value })} />
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

      <InspectorSection title="Цвета" summary={element.style.backgroundTransparent ? 'Прозрачный фон' : element.style.backgroundColor}>
        <div className="color-grid">
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

      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить поле
      </button>
    </section>
  );
};
