import { Trash2 } from 'lucide-react';
import type { KpImageElement, KpPage, KpRect } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { GeometryFields } from './GeometryFields';
import { InspectorSection } from './InspectorSection';

type ImageInspectorProps = {
  assetName?: string;
  element: KpImageElement;
  page: KpPage;
};

export const ImageInspector = ({ assetName, element, page }: ImageInspectorProps) => {
  const updateRect = (rect: KpRect): void => useEditorStore.getState().updateElementRect(page.id, element.id, rect);

  return (
    <section className="inspector-panel" aria-label="Свойства изображения">
      <h3 className="sr-only">Изображение</h3>
      <InspectorSection title="Положение" summary={assetName ?? `${element.rect.width} × ${element.rect.height} мм`} defaultOpen>
        <GeometryFields rect={element.rect} onChange={updateRect} />

        <button
          className="button button-outline fit-page-action"
          type="button"
          onClick={() => updateRect({ x: 0, y: 0, width: page.widthMm, height: page.heightMm })}
        >
          На весь лист
        </button>
      </InspectorSection>

      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить изображение
      </button>
    </section>
  );
};
