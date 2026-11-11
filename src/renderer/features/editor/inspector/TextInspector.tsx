import { Trash2 } from 'lucide-react';
import type { KpTextElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { TextFormatControls } from './TextFormatControls';

type TextInspectorProps = {
  element: KpTextElement;
  pageId: string;
};

export const TextInspector = ({ element, pageId }: TextInspectorProps) => (
  <section className="inspector-panel" aria-label="Свойства текста">
    <h3 className="sr-only">Текст</h3>
    <TextFormatControls value={element.style}
      onChange={(patch) => useEditorStore.getState().updateTextStyle(pageId, element.id, patch)} />
    <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
      <Trash2 size={15} aria-hidden="true" /> Удалить текст
    </button>
  </section>
);
