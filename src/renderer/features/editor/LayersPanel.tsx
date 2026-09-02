import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Layers3, Lock, Pencil, Plus, Trash2, Unlock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useEditorStore } from '@/renderer/store/useEditorStore';

export const LayersPanel = () => {
  const {
    project, activeLayerId, selected, addLayer, renameLayer, deleteLayer, reorderLayer,
    setLayerVisibility, setLayerLocked, setActiveLayer, moveElementToLayer
  } = useEditorStore();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState('');
  const orderedLayers = useMemo(() => [...project.layers].sort((a, b) => b.order - a.order), [project.layers]);
  const elementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    project.pages.forEach((page) => page.elements.forEach((element) => {
      counts.set(element.layerId, (counts.get(element.layerId) ?? 0) + 1);
    }));
    return counts;
  }, [project.pages]);

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
          return (
            <div className={`layer-row ${active ? 'active' : ''} ${unavailable ? 'unavailable' : ''}`} key={layer.id}>
              <button type="button" className="layer-select" aria-pressed={active} disabled={unavailable} onClick={() => setActiveLayer(layer.id)}>
                <span className="layer-dot" aria-hidden="true" /><span>{layer.name}</span><small>{elementCounts.get(layer.id) ?? 0}</small>
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
