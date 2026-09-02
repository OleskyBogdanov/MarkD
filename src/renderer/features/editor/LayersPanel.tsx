import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Layers3, Lock, Pencil, Plus, Trash2, Unlock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KpAsset, KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';

const ELEMENT_TYPE_LABELS: Record<KpElement['type'], string> = {
  text: 'Текст',
  textField: 'Текстовое поле',
  selectField: 'Список',
  image: 'Изображение',
  shape: 'Фигура',
  table: 'Таблица'
};

const SHAPE_NAMES = {
  rectangle: 'Прямоугольник',
  ellipse: 'Эллипс',
  triangle: 'Треугольник',
  line: 'Линия'
} as const;

const compactName = (value: string, fallback: string): string => value.trim().replace(/\s+/g, ' ').slice(0, 80) || fallback;

const getElementName = (element: KpElement, assetsById: Map<string, KpAsset>): string => {
  if (element.type === 'text') return compactName(element.text, 'Без текста');
  if (element.type === 'textField') return compactName(element.label || element.value, 'Без названия');
  if (element.type === 'selectField') return compactName(element.label, 'Без названия');
  if (element.type === 'table') return compactName(element.pageHeader, 'Без названия');
  if (element.type === 'shape') return SHAPE_NAMES[element.shape];
  return compactName(assetsById.get(element.assetId)?.name ?? '', 'Без названия');
};

export const LayersPanel = () => {
  const {
    project, activeLayerId, selected, addLayer, renameLayer, deleteLayer, reorderLayer,
    setLayerVisibility, setLayerLocked, setActiveLayer, moveElementToLayer, select,
    setElementStackPosition, deleteElement
  } = useEditorStore();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState('');
  const orderedLayers = useMemo(() => [...project.layers].sort((a, b) => b.order - a.order), [project.layers]);
  const elementsByLayer = useMemo(() => {
    const entries = new Map<string, Array<{
      element: KpElement;
      name: string;
      pageId: string;
      pageNumber: number;
      typeLabel: string;
    }>>();
    const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
    project.pages.forEach((page, pageIndex) => page.elements.forEach((element) => {
      const layerElements = entries.get(element.layerId) ?? [];
      layerElements.push({
        element,
        name: getElementName(element, assetsById),
        pageId: page.id,
        pageNumber: pageIndex + 1,
        typeLabel: ELEMENT_TYPE_LABELS[element.type]
      });
      entries.set(element.layerId, layerElements);
    }));
    entries.forEach((layerElements) => layerElements.sort((first, second) =>
      first.pageNumber - second.pageNumber || second.element.zIndex - first.element.zIndex
    ));
    return entries;
  }, [project.assets, project.pages]);

  const beginRename = (layerId: string, name: string): void => {
    setEditingLayerId(layerId);
    setLayerNameDraft(name);
  };

  const finishRename = (): void => {
    if (!editingLayerId) return;
    const nextName = layerNameDraft.trim();
    if (nextName) renameLayer(editingLayerId, nextName);
    setEditingLayerId(null);
  };

  return (
    <section className="layers-panel" aria-label="Слои проекта">
      <div className="layers-heading">
        <div><Layers3 size={15} /><strong>Слои</strong></div>
        <button type="button" aria-label="Добавить слой" title="Добавить слой" onClick={addLayer}><Plus size={15} /></button>
      </div>
      <div className="layers-list">
        {orderedLayers.map((layer) => {
          const active = layer.id === activeLayerId;
          const unavailable = !layer.visible || layer.locked;
          const layerElements = elementsByLayer.get(layer.id) ?? [];
          return (
            <div className={`layer-row ${active ? 'active' : ''} ${unavailable ? 'unavailable' : ''}`} key={layer.id}>
              <button type="button" className="layer-select" aria-pressed={active} disabled={unavailable} onClick={() => setActiveLayer(layer.id)}>
                <span className="layer-dot" aria-hidden="true" /><span>{layer.name}</span><small>{layerElements.length}</small>
              </button>
              <div className="layer-actions">
                <button type="button" aria-label={`Переименовать ${layer.name}`} title="Переименовать" onClick={() => beginRename(layer.id, layer.name)}><Pencil size={13} /></button>
                <button type="button" aria-label={layer.visible ? `Скрыть ${layer.name}` : `Показать ${layer.name}`} title={layer.visible ? 'Скрыть' : 'Показать'} onClick={() => setLayerVisibility(layer.id, !layer.visible)}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <button type="button" aria-label={layer.locked ? `Разблокировать ${layer.name}` : `Заблокировать ${layer.name}`} title={layer.locked ? 'Разблокировать' : 'Заблокировать'} onClick={() => setLayerLocked(layer.id, !layer.locked)}>{layer.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                <button type="button" aria-label={`Поднять ${layer.name}`} title="Поднять" onClick={() => reorderLayer(layer.id, 1)} disabled={layer.order >= project.layers.length - 1}><ChevronUp size={13} /></button>
                <button type="button" aria-label={`Опустить ${layer.name}`} title="Опустить" onClick={() => reorderLayer(layer.id, -1)} disabled={layer.order <= 0}><ChevronDown size={13} /></button>
                <button type="button" aria-label={`Удалить ${layer.name}`} title="Удалить слой" onClick={() => deleteLayer(layer.id)} disabled={project.layers.length <= 1}><Trash2 size={13} /></button>
              </div>
              {editingLayerId === layer.id ? (
                <form className="layer-rename-form" onSubmit={(event) => { event.preventDefault(); finishRename(); }}>
                  <input
                    autoFocus
                    aria-label="Новое название слоя"
                    maxLength={80}
                    value={layerNameDraft}
                    onChange={(event) => setLayerNameDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingLayerId(null);
                    }}
                  />
                  <button type="submit" aria-label="Сохранить название" title="Сохранить" disabled={!layerNameDraft.trim()}><Check size={13} /></button>
                  <button type="button" aria-label="Отменить переименование" title="Отменить" onClick={() => setEditingLayerId(null)}><X size={13} /></button>
                </form>
              ) : null}
              {layerElements.length ? (
                <ul className="layer-elements-list" aria-label={`Элементы слоя ${layer.name}`}>
                  {layerElements.map(({ element, name, pageId, pageNumber, typeLabel }) => {
                    const elementSelected = selected.type === 'element' && selected.pageId === pageId && selected.elementId === element.id;
                    return (
                      <li className={`layer-element ${elementSelected ? 'selected' : ''}`} key={`${pageId}:${element.id}`}>
                        <button
                          type="button"
                          className="layer-element-select"
                          aria-label={`${typeLabel}: ${name}`}
                          aria-pressed={elementSelected}
                          disabled={unavailable}
                          onClick={() => {
                            if (!active) setActiveLayer(layer.id);
                            select({ type: 'element', pageId, elementId: element.id });
                          }}
                        >
                          <span className="layer-element-type">{typeLabel}</span>
                          <span className="layer-element-name">{name}</span>
                          {project.pages.length > 1 ? <small>Лист {pageNumber}</small> : null}
                        </button>
                        {elementSelected && active && !unavailable ? (
                          <div className="layer-element-actions">
                            <button type="button" onClick={() => setElementStackPosition(pageId, element.id, 'front')}>На передний план</button>
                            <button type="button" onClick={() => setElementStackPosition(pageId, element.id, 'back')}>На задний план</button>
                            <button type="button" className="danger" onClick={() => deleteElement(pageId, element.id)}>Удалить</button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="layer-elements-empty">В слое нет элементов</p>}
              {selected.type === 'element' && active && project.layers.length > 1 ? (
                <select aria-label="Переместить элемент в слой" value={layer.id} onChange={(event) => moveElementToLayer(selected.pageId, selected.elementId, event.currentTarget.value)}>
                  {orderedLayers.filter((candidate) => candidate.visible && !candidate.locked).map((candidate) => (
                    <option value={candidate.id} key={candidate.id}>Переместить в: {candidate.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};
