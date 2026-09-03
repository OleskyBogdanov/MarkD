import { Plus, Trash2, X } from 'lucide-react';
import type { KpRect, KpSelectFieldElement } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { FontSelect } from '@/renderer/components/ui/FontSelect';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { GeometryFields } from './GeometryFields';
import { InspectorSection } from './InspectorSection';

type SelectFieldInspectorProps = {
  element: KpSelectFieldElement;
  pageId: string;
};

export const SelectFieldInspector = ({ element, pageId }: SelectFieldInspectorProps) => {
  const updateRect = (rect: KpRect): void => useEditorStore.getState().updateElementRect(pageId, element.id, rect);
  const update = (patch: Parameters<ReturnType<typeof useEditorStore.getState>['updateSelectField']>[2]): void => {
    useEditorStore.getState().updateSelectField(pageId, element.id, patch);
  };

  return (
    <section className="inspector-panel" aria-label="Свойства выпадающего списка">
      <h3 className="sr-only">Выпадающий список</h3>
      <InspectorSection title="Содержание" summary={element.label || 'Без подписи'} defaultOpen>
        <div className="inspector-block">
        <label>Подпись<input value={element.label} onChange={(event) => update({ label: event.currentTarget.value })} /></label>
        <label>Placeholder<input value={element.placeholder} onChange={(event) => update({ placeholder: event.currentTarget.value })} /></label>
        <label>
          Выбранный вариант
          <select value={element.selectedOptionId ?? ''} onChange={(event) => update({ selectedOptionId: event.currentTarget.value || null })}>
            <option value="">Не выбран</option>
            {element.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>Шрифт<FontSelect value={element.style.fontId} onChange={(fontId) => update({ style: { fontId } })} /></label>
        </div>
      </InspectorSection>

      <InspectorSection title="Варианты" summary={`${element.options.length}`} defaultOpen>
        <div className="option-list-heading">
          <span>Список вариантов</span>
          <button
            type="button"
            aria-label="Добавить вариант"
            title="Добавить вариант"
            onClick={() => useEditorStore.getState().addSelectOption(pageId, element.id)}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="option-list">
          {element.options.map((option, index) => (
            <div className="option-row" key={option.id}>
              <input
                aria-label={`Вариант ${index + 1}`}
                value={option.label}
                onChange={(event) => useEditorStore.getState().updateSelectOption(pageId, element.id, option.id, event.currentTarget.value)}
              />
              <button
                type="button"
                aria-label={`Удалить вариант ${index + 1}`}
                title="Удалить вариант"
                onClick={() => useEditorStore.getState().deleteSelectOption(pageId, element.id, option.id)}
                disabled={element.options.length <= 1}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="Цвета" summary={element.style.backgroundColor}>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => update({ style: { textColor } })} />
          <ColorControl label="Подпись" value={element.style.labelColor} onChange={(labelColor) => update({ style: { labelColor } })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => update({ style: { backgroundColor } })} />
          <ColorControl label="Граница" value={element.style.borderColor} onChange={(borderColor) => update({ style: { borderColor } })} />
        </div>
      </InspectorSection>

      <InspectorSection title="Положение" summary={`${element.rect.width} × ${element.rect.height} мм`}>
        <GeometryFields rect={element.rect} onChange={updateRect} />
      </InspectorSection>
      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить список
      </button>
    </section>
  );
};
