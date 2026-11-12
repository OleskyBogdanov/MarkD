import { Ellipsis, Grid2X2, Palette, Settings2, Trash2 } from 'lucide-react';
import type { KpTableElement } from '@/renderer/domain/model';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { runHistoryTransaction } from '@/renderer/store/historyTransaction';
import { InspectorSection } from './InspectorSection';
import { readNumber } from './utils';
import { TableAlignmentControls } from './TableAlignmentControls';
import { TextFormatControls } from './TextFormatControls';
import { selectedTableCells, type TableCellStyle } from '@/renderer/domain/tableSelection';
import { resolveTableCellStyle, resolveTableRowHeight } from '@/renderer/domain/tableStyle';
import './table-inspector.css';

type TableInspectorProps = {
  element: KpTableElement;
  pageId: string;
};

export const TableInspector = ({ element, pageId }: TableInspectorProps) => {
  const actions = useEditorStore.getState();
  const selected = useEditorStore((state) => state.selected);
  const cell = selected.type === 'element' && selected.elementId === element.id ? selected.tableCell : undefined;
  const range = selected.type === 'element' && selected.elementId === element.id ? selected.tableRange : undefined;
  const cells = new Set(selectedTableCells(element, range, cell).map((item) => item.id));
  const selectedRowIds = element.rows.filter((row) => row.cells.some((item) => cells.has(item.id))).map((row) => row.id);
  const selectedColumnIds = element.columns.filter((_, index) => element.rows.some((row) => cells.has(row.cells[index].id)));
  const canDeleteRows = selectedRowIds.length > 0 && selectedRowIds.length < element.rows.length;
  const canDeleteColumns = selectedColumnIds.length > 0 && selectedColumnIds.length < element.columns.length;
  const styles = element.rows.flatMap((row) => row.cells.flatMap((item, index) =>
    cells.has(item.id) ? [resolveTableCellStyle(element, row.id, element.columns[index])] : []));
  const style = styles[0] ?? resolveTableCellStyle(element, element.rows[0].id, element.columns[0]);
  const update = (patch: TableCellStyle): void => actions.updateTableSelectionStyle(pageId, element.id, patch);
  const rowHeights = element.rows.filter((row) => row.cells.some((item) => cells.has(item.id))).map((row) => resolveTableRowHeight(element, row.id));

  return (
    <section className="inspector-panel table-inspector-panel" aria-label="Свойства таблицы">
      <h3 className="sr-only">Таблица</h3>
      <TextFormatControls value={{ fontId: style.fontId, fontSize: style.fontSize, color: style.textColor, bold: style.bold, italic: style.italic }}
        mixed={(['fontSize', 'bold', 'italic'] as const).filter((key) => styles.some((item) => item[key] !== style[key]))}
        maxFontSize={24} sizeLabel="Размер текста, px" onChange={({ color, ...patch }) =>
          update({ ...patch, ...(color === undefined ? {} : { textColor: color }) })} />
      <TableAlignmentControls element={element} pageId={pageId} />
      <InspectorSection title="Текст и ячейки" icon={<Settings2 size={16} aria-hidden="true" />} summary={`${style.fontSize} px`} defaultOpen>
        <div className="table-settings-grid">
          <label>Высота выбранных строк, px<input type="number" min={24} max={96} value={rowHeights.every((height) => height === rowHeights[0]) ? rowHeights[0] ?? '' : ''} placeholder="Смешано" onChange={(event) => actions.updateTableSelectionRowHeight(pageId, element.id, readNumber(event.currentTarget.value, rowHeights[0] ?? element.style.rowHeight))} /></label>
          <label>Отступ ячейки, px<input type="number" min={0} max={24} value={style.cellPadding} onChange={(event) => update({ cellPadding: readNumber(event.currentTarget.value, style.cellPadding) })} /></label>
        </div>
        <div className="inspector-block appearance-toggles">
          <label className="toggle-row"><input type="checkbox" checked={element.showPageHeader} onChange={(event) => actions.updateTableSettings(pageId, element.id, { showPageHeader: event.currentTarget.checked })} /><span>Показывать заголовок блока</span></label>
          <label className="toggle-row"><input type="checkbox" checked={element.firstRowHeader} onChange={(event) => actions.updateTableSettings(pageId, element.id, { firstRowHeader: event.currentTarget.checked })} /><span>Первая строка — шапка таблицы</span></label>
          <label className="toggle-row"><input type="checkbox" checked={style.wrapText} onChange={(event) => update({ wrapText: event.currentTarget.checked })} /><span>Переносить текст</span></label>
          {!range && !cell ? <>
            <label className="toggle-row"><input type="checkbox" checked={element.style.headerRowBold} disabled={!element.firstRowHeader} onChange={(event) => actions.updateTableStyle(pageId, element.id, { headerRowBold: event.currentTarget.checked })} /><span>Полужирная шапка</span></label>
            <label className="toggle-row"><input type="checkbox" checked={element.style.alternatingRows} onChange={(event) => actions.updateTableStyle(pageId, element.id, { alternatingRows: event.currentTarget.checked })} /><span>Чередовать цвет строк</span></label>
          </> : null}
        </div>
      </InspectorSection>

      <InspectorSection title="Цвета" icon={<Palette size={16} aria-hidden="true" />} summary={style.backgroundColor}>
        <div className="color-grid">
          <ColorControl label="Фон" value={style.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} />
          <ColorControl label="Текст блока" value={element.style.headerTextColor} onChange={(headerTextColor) => actions.updateTableStyle(pageId, element.id, { headerTextColor })} />
          <ColorControl label="Фон блока" value={element.style.headerBackgroundColor} onChange={(headerBackgroundColor) => actions.updateTableStyle(pageId, element.id, { headerBackgroundColor })} />
          {!range && !cell ? <>
            <ColorControl label="Текст шапки" value={element.style.headerRowTextColor} onChange={(headerRowTextColor) => actions.updateTableStyle(pageId, element.id, { headerRowTextColor })} />
            <ColorControl label="Фон шапки" value={element.style.headerRowBackgroundColor} onChange={(headerRowBackgroundColor) => actions.updateTableStyle(pageId, element.id, { headerRowBackgroundColor })} />
            {element.style.alternatingRows ? <ColorControl label="Чётные строки" value={element.style.alternateRowColor} onChange={(alternateRowColor) => actions.updateTableStyle(pageId, element.id, { alternateRowColor })} /> : null}
          </> : null}
          <ColorControl label="Границы" value={style.borderColor} onChange={(borderColor) => update({ borderColor })} />
        </div>
      </InspectorSection>

      <InspectorSection title="Границы" icon={<Grid2X2 size={16} aria-hidden="true" />} summary={style.borderVisible ? `${style.borderWidth} px` : 'Скрыты'}>
        <div className="inspector-block">
          <label className="toggle-row"><input type="checkbox" checked={style.borderVisible} onChange={(event) => update({ borderVisible: event.currentTarget.checked })} /><span>Показывать границы</span></label>
          <div className="table-settings-grid">
            <label>Толщина, px<input disabled={!style.borderVisible} type="number" min={0} max={6} step={0.5} value={style.borderWidth} onChange={(event) => update({ borderWidth: readNumber(event.currentTarget.value, style.borderWidth) })} /></label>
            <label>
              Стиль
              <select aria-label="Стиль границы" disabled={!style.borderVisible} value={style.borderStyle} onChange={(event) => update({ borderStyle: event.currentTarget.value as typeof style.borderStyle })}>
                <option value="solid">Сплошная</option><option value="dashed">Штриховая</option><option value="dotted">Точечная</option>
              </select>
            </label>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="Действия с таблицей" icon={<Ellipsis size={16} aria-hidden="true" />}>
        <div className="inspector-actions">
          <button type="button" disabled={!canDeleteRows} onClick={() => runHistoryTransaction(() => selectedRowIds.forEach((rowId) => actions.deleteTableRow(pageId, element.id, rowId)))}>Удалить выбранные строки</button>
          <button type="button" disabled={!canDeleteColumns} onClick={() => runHistoryTransaction(() => selectedColumnIds.forEach((columnId) => actions.deleteTableColumn(pageId, element.id, columnId)))}>Удалить выбранные столбцы</button>
        </div>
        <button className="danger-action" type="button" onClick={() => actions.deleteSelected()}><Trash2 size={15} aria-hidden="true" /> Удалить таблицу</button>
      </InspectorSection>
    </section>
  );
};
