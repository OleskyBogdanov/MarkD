import { Trash2 } from 'lucide-react';
import type { KpShapeElement } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { InspectorSection } from './InspectorSection';
import { readNumber } from './utils';
import { TextFormatControls } from './TextFormatControls';

type ShapeInspectorProps = {
  element: KpShapeElement;
  pageId: string;
};

export const ShapeInspector = ({ element, pageId }: ShapeInspectorProps) => {
  const isLine = element.shape === 'line';
  const update = (patch: Parameters<ReturnType<typeof useEditorStore.getState>['updateShape']>[2]): void => {
    useEditorStore.getState().updateShape(pageId, element.id, patch);
  };

  return (
    <section className="inspector-panel" aria-label="Свойства фигуры">
      <h3 className="sr-only">Фигура</h3>
      {!isLine ? <TextFormatControls value={element.textStyle} onChange={(textStyle) => update({ textStyle })} /> : null}
      <InspectorSection
        title="Форма"
        summary={`${element.shape === 'rectangle' ? 'Прямоугольник' : element.shape === 'ellipse' ? 'Эллипс' : element.shape === 'triangle' ? 'Треугольник' : 'Линия'}${element.shape === 'rectangle' ? ` · ${element.style.cornerRadius} px` : ''}`}
        defaultOpen
      >
        <div className="inspector-block">
          <label>
            Тип
            <select aria-label="Тип фигуры" value={element.shape} onChange={(event) => update({ shape: event.currentTarget.value as typeof element.shape })}>
              <option value="rectangle">Прямоугольник</option>
              <option value="ellipse">Эллипс</option>
              <option value="triangle">Треугольник</option>
              <option value="line">Линия</option>
            </select>
          </label>
          {element.shape === 'rectangle' ? (
            <label>
              Скругление
              <span className="measurement-input">
                <input
                  aria-label="Скругление, px"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={element.style.cornerRadius}
                  onChange={(event) => update({ style: { cornerRadius: readNumber(event.currentTarget.value, element.style.cornerRadius) } })}
                />
                <small aria-hidden="true">px</small>
              </span>
            </label>
          ) : null}
        </div>
      </InspectorSection>

      {!isLine ? (
        <InspectorSection title="Заливка" summary={element.style.fillTransparent ? 'Нет' : element.style.fillColor} defaultOpen>
          <div className="color-grid">
            <ColorControl disabled={element.style.fillTransparent} label="Цвет" value={element.style.fillColor} onChange={(fillColor) => update({ style: { fillColor } })} />
          </div>
          <div className="inspector-block appearance-toggles">
            <label className="toggle-row">
              <input type="checkbox" checked={!element.style.fillTransparent} onChange={(event) => update({ style: { fillTransparent: !event.currentTarget.checked } })} />
              <span>Показывать заливку</span>
            </label>
          </div>
        </InspectorSection>
      ) : null}

      <InspectorSection
        key={isLine ? 'line-stroke' : 'shape-stroke'}
        title={isLine ? 'Линия' : 'Контур'}
        summary={`${element.style.strokeWidth} px`}
        defaultOpen={isLine}
      >
        <div className="color-grid">
          <ColorControl label="Цвет" value={element.style.strokeColor} onChange={(strokeColor) => update({ style: { strokeColor } })} />
        </div>
        <div className="table-settings-grid shape-stroke-settings">
          <label>
            Толщина, px
            <input type="number" min={0} max={12} step={0.5} value={element.style.strokeWidth} onChange={(event) => update({ style: { strokeWidth: readNumber(event.currentTarget.value, element.style.strokeWidth) } })} />
          </label>
          <label>
            Стиль
            <select value={element.style.strokeStyle} onChange={(event) => update({ style: { strokeStyle: event.currentTarget.value as typeof element.style.strokeStyle } })}>
              <option value="solid">Сплошная</option>
              <option value="dashed">Штриховая</option>
              <option value="dotted">Точечная</option>
            </select>
          </label>
        </div>
      </InspectorSection>

      <button className="danger-action" type="button" onClick={() => useEditorStore.getState().deleteSelected()}>
        <Trash2 size={15} aria-hidden="true" /> Удалить фигуру
      </button>
    </section>
  );
};
