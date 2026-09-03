import { Layers3, Plus, SlidersHorizontal } from 'lucide-react';
import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import './editor-sidebar.css';

const MIN_PANE_PERCENT = 28;
const MAX_PANE_PERCENT = 72;
const DEFAULT_PANE_PERCENT = 54;
const KEYBOARD_STEP = 4;

const ELEMENT_LABELS: Record<KpElement['type'], string> = {
  text: 'Текст',
  textField: 'Текстовое поле',
  selectField: 'Выпадающий список',
  image: 'Изображение',
  shape: 'Фигура',
  table: 'Таблица'
};

const clampPanePercent = (value: number): number =>
  Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, value));

export const EditorSidebar = () => {
  const { selectionLabel, layerCount, addLayer } = useEditorStore(useShallow((state) => {
    const selected = state.selected;
    if (selected.type !== 'element') {
      return { selectionLabel: 'Документ', layerCount: state.project.layers.length, addLayer: state.addLayer };
    }
    const element = state.project.pages
      .find((page) => page.id === selected.pageId)
      ?.elements.find((candidate) => candidate.id === selected.elementId);
    return {
      selectionLabel: element ? ELEMENT_LABELS[element.type] : 'Документ',
      layerCount: state.project.layers.length,
      addLayer: state.addLayer
    };
  }));
  const [propertiesPanePercent, setPropertiesPanePercent] = useState(DEFAULT_PANE_PERCENT);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const sidebar = event.currentTarget.parentElement;
    if (!sidebar) return;
    const bounds = sidebar.getBoundingClientRect();
    const nextPercent = ((event.clientY - bounds.top) / bounds.height) * 100;
    setPropertiesPanePercent(clampPanePercent(nextPercent));
  };

  const handleDividerKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let nextPercent = propertiesPanePercent;
    if (event.key === 'ArrowUp') nextPercent -= KEYBOARD_STEP;
    else if (event.key === 'ArrowDown') nextPercent += KEYBOARD_STEP;
    else if (event.key === 'Home') nextPercent = MIN_PANE_PERCENT;
    else if (event.key === 'End') nextPercent = MAX_PANE_PERCENT;
    else return;

    event.preventDefault();
    setPropertiesPanePercent(clampPanePercent(nextPercent));
  };

  return (
    <aside
      className="editor-sidebar"
      aria-label="Инспектор свойств"
      style={{ '--properties-pane-size': `${propertiesPanePercent}%` } as CSSProperties}
    >
      <section className="sidebar-section sidebar-properties" aria-labelledby="properties-heading">
        <header className="sidebar-section-header">
          <div className="sidebar-section-title">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <h2 id="properties-heading">Свойства</h2>
          </div>
          <span className="sidebar-context" title={selectionLabel}>{selectionLabel}</span>
        </header>
        <div className="sidebar-section-body inspector-properties-pane">
          <Inspector />
        </div>
      </section>

      <div
        className="sidebar-divider"
        role="separator"
        aria-label="Изменить высоту панелей"
        aria-orientation="horizontal"
        aria-valuemin={MIN_PANE_PERCENT}
        aria-valuemax={MAX_PANE_PERCENT}
        aria-valuenow={Math.round(propertiesPanePercent)}
        tabIndex={0}
        onKeyDown={handleDividerKeyDown}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={updateFromPointer}
      >
        <span aria-hidden="true" />
      </div>

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
