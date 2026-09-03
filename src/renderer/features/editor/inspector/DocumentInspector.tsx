import type { KpProject } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { InspectorSection } from './InspectorSection';

type DocumentInspectorProps = {
  project: KpProject;
};

export const DocumentInspector = ({ project }: DocumentInspectorProps) => {
  const firstPage = project.pages[0];

  return (
    <section className="inspector-panel" aria-label="Свойства документа">
      <h3 className="sr-only">Настройки проекта</h3>
      <InspectorSection
        title="Документ"
        summary={`${project.pages.length} ${project.pages.length === 1 ? 'страница' : 'страницы'}`}
        defaultOpen
      >
        <div className="inspector-block">
          <label>
            Название
            <input
              value={project.metadata.title}
              onChange={(event) => useEditorStore.getState().updateProjectTitle(event.currentTarget.value)}
            />
          </label>
          <ColorControl
            label="Фон первой страницы"
            value={firstPage?.background?.type === 'color' ? firstPage.background.value : '#ffffff'}
            onChange={(value) => {
              if (firstPage) {
                useEditorStore.getState().updatePageBackground(firstPage.id, { type: 'color', value });
              }
            }}
          />
        </div>
      </InspectorSection>
    </section>
  );
};
