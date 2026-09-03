import { Trash2 } from 'lucide-react';
import type { KpRect, KpTableElement } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { FontSelect } from '@/renderer/components/ui/FontSelect';
import { TextPlacementControl } from '@/renderer/components/ui/TextPlacementControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { GeometryFields } from './GeometryFields';
import { InspectorSection } from './InspectorSection';
import { readNumber } from './utils';

type TableInspectorProps = {
  element: KpTableElement;
  pageId: string;
};

export const TableInspector = ({ element, pageId }: TableInspectorProps) => {
  const actions = useEditorStore.getState();
  const updateRect = (rect: KpRect): void => actions.updateElementRect(pageId, element.id, rect);

  return (
    <section className="inspector-panel" aria-label="Свойства таблицы">
      <h3 className="sr-only">Таблица</h3>
      <InspectorSection title="Содержание" summary={`${element.rows.length} × ${element.columns.length}`} defaultOpen>
        <div className="inspector-block">
        <label className="toggle-row">
          <input type="checkbox" checked={element.showPageHeader} onChange={(event) => actions.updateTableSettings(pageId, element.id, { showPageHeader: event.currentTarget.checked })} />
          <span>Показывать заголовок блока</span>
        </label>
        <label>
          Заголовок блока
          <input disabled={!element.showPageHeader} value={element.pageHeader} onChange={(event) => actions.updateTableHeader(pageId, element.id, event.currentTarget.value)} />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={element.firstRowHeader} onChange={(event) => actions.updateTableSettings(pageId, element.id, { firstRowHeader: event.currentTarget.checked })} />
          <span>Первая строка — шапка таблицы</span>
        </label>
        <span className="inspector-field-label">Расположение текста по умолчанию</span>
        <TextPlacementControl
          label="Расположение текста во всей таблице"
          horizontal={element.style.align}
          vertical={element.style.verticalAlign}
          onHorizontalChange={(align) => actions.updateTableStyle(pageId, element.id, { align })}
          onVerticalChange={(verticalAlign) => actions.updateTableStyle(pageId, element.id, { verticalAlign })}
        />
        </div>
      </InspectorSection>

      <InspectorSection title="Текст и ячейки" summary={`${element.style.fontSize} px`} defaultOpen>
        <div className="inspector-block">
          <label>Шрифт<FontSelect value={element.style.fontId} onChange={(fontId) => actions.updateTableStyle(pageId, element.id, { fontId })} /></label>
        </div>
        <div className="table-settings-grid">
          <label>Размер текста, px<input type="number" min={8} max={24} value={element.style.fontSize} onChange={(event) => actions.updateTableStyle(pageId, element.id, { fontSize: readNumber(event.currentTarget.value, element.style.fontSize) })} /></label>
          <label>Высота строки, px<input type="number" min={24} max={96} value={element.style.rowHeight} onChange={(event) => actions.updateTableStyle(pageId, element.id, { rowHeight: readNumber(event.currentTarget.value, element.style.rowHeight) })} /></label>
          <label>Отступ ячейки, px<input type="number" min={0} max={24} value={element.style.cellPadding} onChange={(event) => actions.updateTableStyle(pageId, element.id, { cellPadding: readNumber(event.currentTarget.value, element.style.cellPadding) })} /></label>
        </div>
        <div className="inspector-block appearance-toggles">
          <label className="toggle-row"><input type="checkbox" checked={element.style.wrapText} onChange={(event) => actions.updateTableStyle(pageId, element.id, { wrapText: event.currentTarget.checked })} /><span>Переносить текст</span></label>
          <label className="toggle-row"><input type="checkbox" checked={element.style.headerRowBold} disabled={!element.firstRowHeader} onChange={(event) => actions.updateTableStyle(pageId, element.id, { headerRowBold: event.currentTarget.checked })} /><span>Полужирная шапка</span></label>
          <label className="toggle-row"><input type="checkbox" checked={element.style.alternatingRows} onChange={(event) => actions.updateTableStyle(pageId, element.id, { alternatingRows: event.currentTarget.checked })} /><span>Чередовать цвет строк</span></label>
        </div>
      </InspectorSection>

      <InspectorSection title="Цвета" summary={element.style.backgroundColor}>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => actions.updateTableStyle(pageId, element.id, { textColor })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => actions.updateTableStyle(pageId, element.id, { backgroundColor })} />
          <ColorControl label="Текст блока" value={element.style.headerTextColor} onChange={(headerTextColor) => actions.updateTableStyle(pageId, element.id, { headerTextColor })} />
          <ColorControl label="Фон блока" value={element.style.headerBackgroundColor} onChange={(headerBackgroundColor) => actions.updateTableStyle(pageId, element.id, { headerBackgroundColor })} />
          <ColorControl label="Текст шапки" value={element.style.headerRowTextColor} onChange={(headerRowTextColor) => actions.updateTableStyle(pageId, element.id, { headerRowTextColor })} />
          <ColorControl label="Фон шапки" value={element.style.headerRowBackgroundColor} onChange={(headerRowBackgroundColor) => actions.updateTableStyle(pageId, element.id, { headerRowBackgroundColor })} />
          {element.style.alternatingRows ? <ColorControl label="Чётные строки" value={element.style.alternateRowColor} onChange={(alternateRowColor) => actions.updateTableStyle(pageId, element.id, { alternateRowColor })} /> : null}
          <ColorControl label="Границы" value={element.style.borderColor} onChange={(borderColor) => actions.updateTableStyle(pageId, element.id, { borderColor })} />
        </div>
      </InspectorSection>

      <InspectorSection title="Границы" summary={element.style.borderVisible ? `${element.style.borderWidth} px` : 'Скрыты'}>
        <div className="inspector-block">
          <label className="toggle-row"><input type="checkbox" checked={element.style.borderVisible} onChange={(event) => actions.updateTableStyle(pageId, element.id, { borderVisible: event.currentTarget.checked })} /><span>Показывать границы</span></label>
          <div className="table-settings-grid">
            <label>Толщина, px<input disabled={!element.style.borderVisible} type="number" min={0} max={6} step={0.5} value={element.style.borderWidth} onChange={(event) => actions.updateTableStyle(pageId, element.id, { borderWidth: readNumber(event.currentTarget.value, element.style.borderWidth) })} /></label>
            <label>
              Стиль
              <select aria-label="Стиль границы" disabled={!element.style.borderVisible} value={element.style.borderStyle} onChange={(event) => actions.updateTableStyle(pageId, element.id, { borderStyle: event.currentTarget.value as typeof element.style.borderStyle })}>
                <option value="solid">Сплошная</option><option value="dashed">Штриховая</option><option value="dotted">Точечная</option>
              </select>
            </label>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Положение" summary={`${element.rect.width} × ${element.rect.height} мм`}>
        <GeometryFields rect={element.rect} onChange={updateRect} />
      </InspectorSection>

      <div className="inspector-actions inspector-actions-stack">
        <button type="button" onClick={() => actions.addTableRow(pageId, element.id)}>Добавить строку</button>
        <button type="button" onClick={() => actions.addTableColumn(pageId, element.id)}>Добавить колонку</button>
      </div>
      <button className="danger-action" type="button" onClick={() => actions.deleteSelected()}><Trash2 size={15} aria-hidden="true" /> Удалить таблицу</button>
    </section>
  );
};
