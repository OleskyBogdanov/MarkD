import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Columns3, Plus, Rows3, Trash2 } from 'lucide-react';
import type { KpRect, KpTableElement, RenderMode } from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import { resolveTableCellAlign } from '@/renderer/domain/tableStyle';

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
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const TableElementRenderer = ({
  element,
  mode,
  rect,
  scale,
  selected,
  zoom,
  showPrimaryChrome,
  onSelect,
  onAddRow,
  onAddColumn,
  onDeleteColumn,
  onDeleteRow,
  onCellChange,
  onMoveStart
}: TableElementRendererProps) => {
  const titleHeight = element.showPageHeader ? 26 : 0;
  const columnWidths = element.rows[0]?.cells.map((cell) => cell.widthMm) ?? [];
  const totalColumnWidth = columnWidths.reduce((sum, width) => sum + width, 0) || element.columns.length;
  const tableVariables = {
    '--table-row-height': `${element.style.rowHeight * zoom}px`,
    '--table-cell-padding': `${element.style.cellPadding * zoom}px`,
    '--table-font-size': `${element.style.fontSize * zoom}px`,
    '--table-border-width': `${(element.style.borderVisible ? element.style.borderWidth : 0) * zoom}px`,
    '--table-border-style': element.style.borderStyle
  } as CSSProperties;

  const chrome = showPrimaryChrome ? (
    <>
      <div className="table-chrome-actions" aria-label="Действия таблицы">
        <button type="button" aria-label="Добавить строку таблицы" title="Добавить строку" onClick={onAddRow}><Rows3 /><Plus /></button>
        <button type="button" aria-label="Добавить колонку таблицы" title="Добавить колонку" onClick={onAddColumn}><Columns3 /><Plus /></button>
        <button type="button" aria-label="Удалить последнюю колонку таблицы" title="Удалить последнюю колонку" onClick={onDeleteColumn} disabled={element.columns.length <= 1}><Trash2 /></button>
      </div>
      <div className="table-row-actions" aria-label="Удаление строк таблицы">
        {element.rows.map((row, rowIndex) => (
          <button
            type="button"
            key={row.id}
            aria-label={`Удалить строку ${rowIndex + 1}`}
            title={`Удалить строку ${rowIndex + 1}`}
            style={{ top: `${(titleHeight + 5 + rowIndex * element.style.rowHeight) * zoom}px` }}
            onClick={() => onDeleteRow(row.id)}
            disabled={element.rows.length <= 1}
          >
            <Trash2 />
          </button>
        ))}
      </div>
    </>
  ) : null;

  const renderRow = (row: KpTableElement['rows'][number], rowIndex: number, header: boolean): ReactNode => {
    const CellTag = header ? 'th' : 'td';
    const bodyIndex = element.firstRowHeader ? rowIndex - 1 : rowIndex;
    const backgroundColor = header
      ? element.style.headerRowBackgroundColor
      : element.style.alternatingRows && bodyIndex % 2 === 1
        ? element.style.alternateRowColor
        : element.style.backgroundColor;
    const textColor = header ? element.style.headerRowTextColor : element.style.textColor;

    return (
      <tr key={row.id}>
        {row.cells.map((cell, index) => {
          const contentStyle: CSSProperties = {
            color: textColor,
            textAlign: resolveTableCellAlign(element, row.id, element.columns[index]),
            fontWeight: header && element.style.headerRowBold ? 700 : 400,
            whiteSpace: element.style.wrapText ? 'pre-wrap' : 'pre'
          };
          return (
            <CellTag
              key={cell.id}
              scope={header ? 'col' : undefined}
              style={{
                borderColor: element.style.borderColor,
                borderStyle: element.style.borderStyle,
                backgroundColor,
                verticalAlign: element.style.verticalAlign
              }}
            >
              {mode === 'edit' ? (
                <textarea
                  aria-label={`Ячейка таблицы ${index + 1}`}
                  value={cell.text}
                  style={contentStyle}
                  onChange={(event) => onCellChange(row.id, element.columns[index], event.currentTarget.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={onSelect}
                />
              ) : (
                <span style={contentStyle}>{cell.text || '\u00a0'}</span>
              )}
            </CellTag>
          );
        })}
      </tr>
    );
  };

  const headerRow = element.firstRowHeader ? element.rows[0] : undefined;
  const bodyRows = element.firstRowHeader ? element.rows.slice(1) : element.rows;

  return (
    <ElementFrame
      className="table-element"
      mode={mode}
      rect={rect}
      scale={scale}
      selected={selected}
      testId="table-element"
      zIndex={element.zIndex}
      moveLabel="Переместить таблицу"
      moveTestId="table-drag-handle"
      resizable={false}
      chrome={chrome}
      onSelect={onSelect}
      onMoveStart={onMoveStart}
      onResizeStart={() => undefined}
    >
      {element.showPageHeader ? (
        <div className="document-table-header" style={{ color: element.style.headerTextColor, backgroundColor: element.style.headerBackgroundColor }}>{element.pageHeader || '\u00a0'}</div>
      ) : null}
      <table className="document-table" style={{ ...tableVariables, color: element.style.textColor, backgroundColor: element.style.backgroundColor }}>
        <colgroup>
          {element.columns.map((columnId, index) => (
            <col key={columnId} style={{ width: `${((columnWidths[index] ?? 1) / totalColumnWidth) * 100}%` }} />
          ))}
        </colgroup>
        {headerRow ? <thead>{renderRow(headerRow, 0, true)}</thead> : null}
        <tbody>
          {bodyRows.map((row, bodyIndex) => renderRow(row, bodyIndex + (element.firstRowHeader ? 1 : 0), false))}
        </tbody>
      </table>
    </ElementFrame>
  );
};
