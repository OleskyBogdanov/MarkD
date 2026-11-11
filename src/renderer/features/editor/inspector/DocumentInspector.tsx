import type { KpProject } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';

type DocumentInspectorProps = {
  project: KpProject;
};

export const DocumentInspector = ({ project }: DocumentInspectorProps) => {
  const activePageId = useEditorStore(state => state.activePageId);
  const firstPage = project.pages.find(page => page.id === activePageId) ?? project.pages[0];

  return (
    <section className="inspector-panel document-properties" aria-label="Свойства документа">
      <h3 className="sr-only">Настройки проекта</h3>
      <ColorControl
        label="Фон страницы"
        value={firstPage?.background?.type === 'color' ? firstPage.background.value : '#ffffff'}
        onChange={(value) => {
          if (firstPage) {
            useEditorStore.getState().updatePageBackground(firstPage.id, { type: 'color', value });
          }
        }}
      />
    </section>
  );
};
