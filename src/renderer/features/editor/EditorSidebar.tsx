import { Layers3, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { LayersPanel } from './LayersPanel';
import './editor-sidebar.css';

export const EditorSidebar = () => {
  const { layerCount, addLayer } = useEditorStore(useShallow((state) => ({
    layerCount: state.project.layers.length,
    addLayer: state.addLayer
  })));

  return (
    <aside className="editor-sidebar" aria-label="Структура документа">
      <section className="sidebar-section sidebar-structure" aria-labelledby="structure-heading">
        <header className="sidebar-section-header">
          <div className="sidebar-section-title">
            <Layers3 size={15} aria-hidden="true" />
            <h2 id="structure-heading">Структура</h2>
          </div>
          <div className="sidebar-section-actions">
            <span className="sidebar-context">{layerCount}</span>
            <button type="button" aria-label="Добавить слой" title="Добавить слой" onClick={addLayer}>
              <Plus size={15} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="sidebar-section-body inspector-layers-pane">
          <LayersPanel />
        </div>
      </section>
    </aside>
  );
};
