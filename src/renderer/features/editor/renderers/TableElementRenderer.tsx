import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Columns3, Plus, Rows3 } from 'lucide-react';
import './table-element.css';
import { calculateTableRowHeightPx, clamp, type KpRect, type KpTableElement, type RenderMode } from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import { resolveTableCellStyle, resolveTableRowHeight } from '@/renderer/domain/tableStyle';
import { selectedTableCells, type TableCellPosition, type TableRangeSelection } from '@/renderer/domain/tableSelection';
import { BufferedInput } from '@/renderer/components/ui/BufferedTextControl';
import { useTextOverflow } from '@/renderer/components/ui/useTextOverflow';
import { fontFamilyForId } from '@/renderer/domain/fontRegistry';
import { TableCellContent } from './TableCellContent';
import { TableResizeHandle } from './TableResizeHandle';
import { useTableSelectionControls } from './TableSelectionControls';

type TableElementRendererProps = {
  element: KpTableElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  showPrimaryChrome: boolean;
  onSelect: () => void;
  onCellSelect: (rowId: string, columnId: string) => void;
  sourceTable: KpTableElement;
  tableRange?: TableRangeSelection;
  tableCell?: TableCellPosition;
  onRangeSelect: (range: TableRangeSelection) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onHeaderChange: (value: string) => void;
  onCellChange: (rowId: string, columnId: string, value: string) => void;
  onColumnResize: (columnId: string, widthMm: number) => void;
  onRowResize: (rowId: string, heightPx: number) => void;
  onMoveStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>) => void;
};

export const TableElementRenderer = ({
  element, mode, rect, scale, selected, zoom, showPrimaryChrome, onSelect,
  onAddRow, onAddColumn, onHeaderChange, onCellChange, onColumnResize, onRowResize, onMoveStart, onResizeStart, onCellSelect,
  sourceTable, tableRange, tableCell, onRangeSelect
}: TableElementRendererProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const hasOverflow = useTextOverflow(contentRef, mode === 'edit', element, rect);
  const { selectionButton, selectionKeyDown, startSelection, moveSelection, stopSelection } = useTableSelectionControls({
    element, sourceTable, contentRef, tableRange, tableCell, onRangeSelect, onSelect
  });
  const selectedIds = new Set(selected && (tableRange || tableCell)
    ? selectedTableCells(sourceTable, tableRange, tableCell).map((cell) => cell.id) : []);
  const titleHeight = element.showPageHeader ? 26 : 0;
  const storedRowHeights = element.rows.map((row) => resolveTableRowHeight(element, row.id));
  const storedAverage = storedRowHeights.reduce((sum, height) => sum + height, 0) / Math.max(1, storedRowHeights.length);
  const renderedAverage = clamp(calculateTableRowHeightPx(rect.height, element.rows.length, element.showPageHeader), 24, 96);
  const liveScale = renderedAverage / Math.max(1, storedAverage);
  const renderedRowHeights = storedRowHeights.map((height) => clamp(height * liveScale, 24, 96));
  const columnWidths = element.rows[0]?.cells.map((cell) => cell.widthMm) ?? [];
  const totalColumnWidth = columnWidths.reduce((sum, width) => sum + width, 0) || element.columns.length;
  const tableVariables = {
    '--table-font-family': fontFamilyForId(element.style.fontId),
    '--table-cell-padding': `${element.style.cellPadding * zoom}px`,
    '--table-font-size': `${element.style.fontSize * zoom}px`,
    '--table-border-width': `${(element.style.borderVisible ? element.style.borderWidth : 0) * zoom}px`,
    '--table-border-style': element.style.borderStyle
  } as CSSProperties;
  const rowTops = renderedRowHeights.reduce<number[]>((tops, height, index) => {
    tops.push((tops[index] ?? 0) + height);
    return tops;
  }, [0]);
  let cumulativeColumnWidth = 0;
  const columnBoundaries = columnWidths.slice(0, -1).map((width) => {
    cumulativeColumnWidth += width;
    return cumulativeColumnWidth;
  });

  const chrome = showPrimaryChrome ? (
    <>
    <div className="table-chrome-actions" aria-label="Добавление строк и колонок">
      <button type="button" aria-label="Добавить строку таблицы" title="Добавить строку" onClick={onAddRow}><Rows3 /><Plus /></button>
      <button type="button" aria-label="Добавить колонку таблицы" title="Добавить колонку" onClick={onAddColumn}><Columns3 /><Plus /></button>
    </div>
    <div className="table-resize-guides">
      {columnBoundaries.map((boundary, index) => {
        const leftWidth = columnWidths[index] ?? 35;
        const rightWidth = columnWidths[index + 1] ?? 35;
        return (
          <TableResizeHandle key={element.columns[index]} ariaLabel={`Изменить ширину колонки ${index + 1}`} className="table-column-resize-handle"
            max={leftWidth + rightWidth - 10} min={10} orientation="vertical" pixelsPerUnit={(rect.width * scale) / totalColumnWidth}
            style={{ left: `${(boundary / totalColumnWidth) * 100}%`, top: `${titleHeight * zoom}px` }} testId={`table-column-resize-${index + 1}`}
            value={leftWidth} onChange={(widthMm) => onColumnResize(element.columns[index], widthMm)} />
        );
      })}
      {element.rows.map((row, index) => (
        <TableResizeHandle key={row.id}
          ariaLabel={element.firstRowHeader && index === 0 ? 'Изменить высоту шапки таблицы' : `Изменить высоту строки ${index + 1}`}
          className="table-row-resize-handle" max={96} min={24} orientation="horizontal" pixelsPerUnit={zoom}
          style={{ top: `${(titleHeight + rowTops[index + 1]) * zoom}px` }} testId={element.firstRowHeader && index === 0 ? 'table-header-row-resize' : `table-row-resize-${index + 1}`}
          value={storedRowHeights[index]} onChange={(heightPx) => onRowResize(row.id, heightPx)} />
      ))}
    </div>
    </>
  ) : null;

  const renderRow = (row: KpTableElement['rows'][number], rowIndex: number, header: boolean): ReactNode => {
    const CellTag = header ? 'th' : 'td';
    const rowVariables = { '--table-row-height': `${renderedRowHeights[rowIndex] * zoom}px` } as CSSProperties;
    return (
      <tr key={row.id} style={rowVariables}>
        {row.cells.map((cell, index) => {
          const columnId = element.columns[index];
          const style = resolveTableCellStyle(sourceTable, row.id, columnId);
          const position = { rowId: row.id, columnId };
          const contentStyle: CSSProperties = {
            color: style.textColor, fontFamily: fontFamilyForId(style.fontId), fontSize: `${style.fontSize * zoom}px`,
            padding: `${style.cellPadding * zoom}px`, textAlign: style.align, fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? 'italic' : 'normal', whiteSpace: style.wrapText ? 'pre-wrap' : 'pre'
          };
          return (
            <CellTag key={cell.id} scope={header ? 'col' : undefined} tabIndex={-1}
              data-table-id={element.id} data-table-row={row.id} data-table-column={columnId}
              data-cell-selected={mode === 'edit' && selectedIds.has(cell.id) ? 'true' : undefined}
              onPointerDown={mode === 'edit' ? (event) => startSelection(event, 'cells', position) : undefined}
              onKeyDown={mode === 'edit' ? (event) => selectionKeyDown(event, 'cells', position) : undefined}
              onPointerMove={moveSelection} onPointerUp={stopSelection} onPointerCancel={stopSelection}
              onLostPointerCapture={stopSelection}
              style={{ '--table-cell-padding': `${style.cellPadding * zoom}px`, '--table-font-size': `${style.fontSize * zoom}px`, borderColor: style.borderColor, borderStyle: style.borderStyle, borderWidth: `${(style.borderVisible ? style.borderWidth : 0) * zoom}px`, backgroundColor: style.backgroundColor, verticalAlign: style.verticalAlign } as CSSProperties}>
              {mode === 'edit' ? selectionButton('cells', position, `Выбрать ячейку ${sourceTable.rows.findIndex((candidate) => candidate.id === row.id) + 1}, ${index + 1}`) : null}
              <TableCellContent ariaLabel={`Ячейка таблицы ${index + 1}`} mode={mode} style={contentStyle}
                value={cell.text} verticalAlign={style.verticalAlign}
                onChange={(value) => onCellChange(row.id, columnId, value)}
                onFocus={() => onCellSelect(row.id, columnId)}
                onSelect={(event, editing) => startSelection(event, 'cells', position, editing)}
                onMove={moveSelection} onStop={stopSelection}
              />
            </CellTag>
          );
        })}
      </tr>
    );
  };
  const headerRow = element.firstRowHeader ? element.rows[0] : undefined;
  const bodyRows = element.firstRowHeader ? element.rows.slice(1) : element.rows;
  return (
    <ElementFrame className="table-element" mode={mode} rect={rect} scale={scale} selected={selected} testId="table-element" zIndex={element.zIndex}
      moveLabel="Переместить таблицу" resizeLabel="Изменить размер таблицы" moveTestId="table-drag-handle"
      resizable={showPrimaryChrome} chrome={chrome} hasOverflow={hasOverflow} onSelect={onSelect} onMoveStart={onMoveStart} onResizeStart={onResizeStart}>
      {mode === 'edit' ? <div className="table-selection-gutters" aria-label="Выделение строк и столбцов">
        {element.columns.map((columnId, index) => selectionButton('columns', { rowId: element.rows[0].id, columnId }, `Выбрать столбец ${index + 1}`, {
          top: '-10px',
          left: `${columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0) / totalColumnWidth * 100}%`,
          width: `${(columnWidths[index] ?? 1) / totalColumnWidth * 100}%`
        }))}
        {element.rows.map((row, index) => selectionButton('rows', { rowId: row.id, columnId: element.columns[0] }, `Выбрать строку ${sourceTable.rows.findIndex((candidate) => candidate.id === row.id) + 1}`, {
          top: `${(titleHeight + rowTops[index]) * zoom}px`, height: `${renderedRowHeights[index] * zoom}px`
        }))}
      </div> : null}
      <div ref={contentRef}>
        {element.showPageHeader ? <div className="document-table-header"
          style={{ color: element.style.headerTextColor, backgroundColor: element.style.headerBackgroundColor }}>
          {mode === 'edit' ? <BufferedInput data-overflow-text aria-label="Заголовок блока" value={element.pageHeader} onCommit={onHeaderChange}
            readOnly onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}
            onDoubleClick={(event) => { event.currentTarget.readOnly = false; event.currentTarget.focus(); event.currentTarget.select(); }}
            onFocus={(event) => { event.currentTarget.readOnly = false; onSelect(); }}
            onBlur={(event) => { event.currentTarget.readOnly = true; }}
            onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}
          /> : element.pageHeader || '\u00a0'}
        </div> : null}
        <table className="document-table" style={{ ...tableVariables, color: element.style.textColor, backgroundColor: element.style.backgroundColor }}>
          <colgroup>{element.columns.map((columnId, index) => <col key={columnId} style={{ width: `${((columnWidths[index] ?? 1) / totalColumnWidth) * 100}%` }} />)}</colgroup>
          {headerRow ? <thead>{renderRow(headerRow, 0, true)}</thead> : null}
          <tbody>{bodyRows.map((row, bodyIndex) => renderRow(row, bodyIndex + (element.firstRowHeader ? 1 : 0), false))}</tbody>
        </table>
      </div>
    </ElementFrame>
  );
};
