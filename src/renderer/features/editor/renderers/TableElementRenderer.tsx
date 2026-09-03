import {
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { Columns3, Plus, Rows3, Trash2 } from 'lucide-react';
import './table-element.css';
import {
  calculateTableRowHeightPx,
  clamp,
  type KpRect,
  type KpTableElement,
  type RenderMode,
  type VerticalAlign
} from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import { resolveTableCellAlign, resolveTableCellVerticalAlign, resolveTableRowHeight } from '@/renderer/domain/tableStyle';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { useAutoSizeTextarea } from '@/renderer/components/ui/useAutoSizeTextarea';
import { fontFamilyForId } from '@/renderer/domain/fontRegistry';

const verticalContentAlign: Record<VerticalAlign, CSSProperties['justifyContent']> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end'
};

type TableCellContentProps = {
  ariaLabel: string;
  mode: RenderMode;
  style: CSSProperties;
  value: string;
  verticalAlign: VerticalAlign;
  onChange: (value: string) => void;
  onFocus: () => void;
};

const TableCellContent = ({
  ariaLabel,
  mode,
  style,
  value,
  verticalAlign,
  onChange,
  onFocus
}: TableCellContentProps) => {
  const autoSize = useAutoSizeTextarea();

  return (
    <div className="table-cell-content" style={{ justifyContent: verticalContentAlign[verticalAlign] }}>
      {mode === 'edit' ? (
        <BufferedTextarea
          ref={autoSize.ref}
          aria-label={ariaLabel}
          rows={1}
          value={value}
          style={style}
          onCommit={onChange}
          onInput={autoSize.resize}
          onPointerDown={(event) => event.stopPropagation()}
          onFocus={onFocus}
        />
      ) : <span style={style}>{value || '\u00a0'}</span>}
    </div>
  );
};

type TableResizeHandleProps = {
  ariaLabel: string;
  className: string;
  max: number;
  min: number;
  orientation: 'horizontal' | 'vertical';
  pixelsPerUnit: number;
  style: CSSProperties;
  testId: string;
  value: number;
  onChange: (value: number) => void;
};

const TableResizeHandle = ({ ariaLabel, className, max, min, orientation, pixelsPerUnit, style, testId, value, onChange }: TableResizeHandleProps) => {
  const dragRef = useRef<{ pointerPosition: number; value: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerPosition: orientation === 'vertical' ? event.clientX : event.clientY, value };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const pointerPosition = orientation === 'vertical' ? event.clientX : event.clientY;
    onChange(clamp(drag.value + (pointerPosition - drag.pointerPosition) / Math.max(0.01, pixelsPerUnit), min, max));
  };
  const stopPointerDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const decreases = orientation === 'vertical' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
    const increases = orientation === 'vertical' ? event.key === 'ArrowRight' : event.key === 'ArrowDown';
    if (!decreases && !increases) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    onChange(clamp(value + (increases ? step : -step), min, max));
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemax={Math.round(max)}
      aria-valuemin={Math.round(min)}
      aria-valuenow={Math.round(value)}
      className={className}
      data-testid={testId}
      role="separator"
      style={style}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerCancel={stopPointerDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopPointerDrag}
    />
  );
};

type TableElementRendererProps = {
  element: KpTableElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  zoom: number;
  showPrimaryChrome: boolean;
  onSelect: () => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: (rowId: string) => void;
  onCellChange: (rowId: string, columnId: string, value: string) => void;
  onColumnResize: (columnId: string, widthMm: number) => void;
  onRowResize: (rowId: string, heightPx: number) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const TableElementRenderer = ({
  element, mode, rect, scale, selected, zoom, showPrimaryChrome, onSelect, onAddRow, onAddColumn,
  onDeleteColumn, onDeleteRow, onCellChange, onColumnResize, onRowResize, onMoveStart, onResizeStart
}: TableElementRendererProps) => {
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
      <div className="table-chrome-actions" aria-label="Действия таблицы">
        <button type="button" aria-label="Добавить строку таблицы" title="Добавить строку" onClick={onAddRow}><Rows3 /><Plus /></button>
        <button type="button" aria-label="Добавить колонку таблицы" title="Добавить колонку" onClick={onAddColumn}><Columns3 /><Plus /></button>
        <button type="button" aria-label="Удалить последнюю колонку таблицы" title="Удалить последнюю колонку" onClick={onDeleteColumn} disabled={element.columns.length <= 1}><Trash2 /></button>
      </div>
      <div className="table-row-actions" aria-label="Удаление строк таблицы">
        {element.rows.map((row, rowIndex) => (
          <button type="button" key={row.id} aria-label={`Удалить строку ${rowIndex + 1}`} title={`Удалить строку ${rowIndex + 1}`}
            style={{ top: `${(titleHeight + 5 + rowTops[rowIndex]) * zoom}px` }} onClick={() => onDeleteRow(row.id)} disabled={element.rows.length <= 1}>
            <Trash2 />
          </button>
        ))}
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
    const bodyIndex = element.firstRowHeader ? rowIndex - 1 : rowIndex;
    const backgroundColor = header ? element.style.headerRowBackgroundColor : element.style.alternatingRows && bodyIndex % 2 === 1 ? element.style.alternateRowColor : element.style.backgroundColor;
    const textColor = header ? element.style.headerRowTextColor : element.style.textColor;
    const rowVariables = { '--table-row-height': `${renderedRowHeights[rowIndex] * zoom}px` } as CSSProperties;

    return (
      <tr key={row.id} style={rowVariables}>
        {row.cells.map((cell, index) => {
          const columnId = element.columns[index];
          const verticalAlign = resolveTableCellVerticalAlign(element, row.id, columnId);
          const contentStyle: CSSProperties = {
            color: textColor,
            textAlign: resolveTableCellAlign(element, row.id, columnId),
            fontWeight: header && element.style.headerRowBold ? 700 : 400,
            whiteSpace: element.style.wrapText ? 'pre-wrap' : 'pre'
          };
          return (
            <CellTag key={cell.id} scope={header ? 'col' : undefined} style={{ borderColor: element.style.borderColor, borderStyle: element.style.borderStyle, backgroundColor, verticalAlign }}>
              <TableCellContent
                ariaLabel={`Ячейка таблицы ${index + 1}`}
                mode={mode}
                style={contentStyle}
                value={cell.text}
                verticalAlign={verticalAlign}
                onChange={(value) => onCellChange(row.id, columnId, value)}
                onFocus={onSelect}
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
      resizable={showPrimaryChrome} chrome={chrome} onSelect={onSelect} onMoveStart={onMoveStart} onResizeStart={onResizeStart}>
      {element.showPageHeader ? <div className="document-table-header" style={{ color: element.style.headerTextColor, backgroundColor: element.style.headerBackgroundColor }}>{element.pageHeader || '\u00a0'}</div> : null}
      <table className="document-table" style={{ ...tableVariables, color: element.style.textColor, backgroundColor: element.style.backgroundColor }}>
        <colgroup>{element.columns.map((columnId, index) => <col key={columnId} style={{ width: `${((columnWidths[index] ?? 1) / totalColumnWidth) * 100}%` }} />)}</colgroup>
        {headerRow ? <thead>{renderRow(headerRow, 0, true)}</thead> : null}
        <tbody>{bodyRows.map((row, bodyIndex) => renderRow(row, bodyIndex + (element.firstRowHeader ? 1 : 0), false))}</tbody>
      </table>
    </ElementFrame>
  );
};
