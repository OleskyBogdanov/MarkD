import { Trash2 } from 'lucide-react';
import type { KpImageElement, KpPage } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';

type ImageInspectorProps = {
  assetName?: string;
  element: KpImageElement;
  page: KpPage;
};

export const ImageInspector = ({ assetName, element, page }: ImageInspectorProps) => (
  <section className="inspector-panel" aria-label="Свойства изображения">
    <h3 className="sr-only">Изображение</h3>
    <span className="inspector-asset-name" title={assetName}>{assetName}</span>
    <button className="button button-outline fit-page-action" type="button"
      onClick={() => useEditorStore.getState().updateElementRect(page.id, element.id, {
        x: 0, y: 0, width: page.widthMm, height: page.heightMm
      })}>
      На весь лист
    </button>
    <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
      <Trash2 size={15} aria-hidden="true" /> Удалить изображение
    </button>
  </section>
);
