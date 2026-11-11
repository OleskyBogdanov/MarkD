import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { clamp, type KpTableElement } from '@/renderer/domain/model';
import type { TableCellPosition, TableRangeSelection } from '@/renderer/domain/tableSelection';

type Props = {
  readonly element: KpTableElement;
  readonly sourceTable: KpTableElement;
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly tableRange?: TableRangeSelection;
  readonly tableCell?: TableCellPosition;
  readonly onRangeSelect: (range: TableRangeSelection) => void;
  readonly onSelect: () => void;
};

export const useTableSelectionControls = ({ element, sourceTable, contentRef, tableRange, tableCell, onRangeSelect, onSelect }: Props) => {
  const dragSelection = useRef<TableRangeSelection | null>(null);
  const nativeTextSelection = useRef(false);
  const startSelection = (event: PointerEvent<HTMLElement>, kind: TableRangeSelection['kind'], position: TableCellPosition, allowTextSelection = false): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!allowTextSelection) {
      event.preventDefault();
      const focusTarget = event.currentTarget instanceof HTMLTextAreaElement
        ? event.currentTarget.closest<HTMLElement>('th, td') : event.currentTarget;
      focusTarget?.focus({ preventScroll: true });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const range = { kind, anchor: event.shiftKey && !allowTextSelection ? tableRange?.anchor ?? tableCell ?? position : position, focus: position };
    dragSelection.current = range;
    nativeTextSelection.current = allowTextSelection;
    if (!allowTextSelection) onRangeSelect(range);
  };
  const moveSelection = (event: PointerEvent<HTMLElement>): void => {
    const range = dragSelection.current;
    if (!range) return;
    // Geometry also resolves the nearest cell while the pointer is outside the table.
    const rows = Array.from(contentRef.current?.querySelectorAll('tr') ?? []);
    const row = rows.find((candidate) => candidate.getBoundingClientRect().bottom > event.clientY) ?? rows.at(-1);
    const cells = Array.from(row?.querySelectorAll<HTMLElement>('th, td') ?? []);
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-table-row][data-table-column]');
    const cell = hit?.dataset['tableId'] === element.id
      ? hit : cells.find((candidate) => candidate.getBoundingClientRect().right > event.clientX) ?? cells.at(-1);
    let rowId = cell?.dataset['tableRow'];
    const columnId = cell?.dataset['tableColumn'];
    const headerId = sourceTable.firstRowHeader ? sourceTable.rows[0].id : undefined;
    if (range.kind === 'cells' && range.anchor.rowId !== headerId && rowId === headerId) {
      rowId = cell?.closest('table')?.querySelector<HTMLElement>('tbody [data-table-row]')?.dataset['tableRow']
        ?? sourceTable.rows[1]?.id;
    }
    if (!rowId || !columnId || (range.focus.rowId === rowId && range.focus.columnId === columnId)) return;
    if (nativeTextSelection.current) {
      event.preventDefault();
      event.currentTarget.blur();
      event.currentTarget.closest<HTMLElement>('th, td')?.focus({ preventScroll: true });
      nativeTextSelection.current = false;
    }
    dragSelection.current = { ...range, focus: { rowId, columnId } };
    onRangeSelect(dragSelection.current);
  };
  const stopSelection = (event: PointerEvent<HTMLElement>): void => {
    dragSelection.current = null;
    nativeTextSelection.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const selectionKeyDown = (event: KeyboardEvent<HTMLElement>, kind: TableRangeSelection['kind'], position: TableCellPosition): void => {
    const current = tableRange?.focus ?? position;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      const selector = `[data-table-id="${CSS.escape(element.id)}"][data-table-row="${CSS.escape(current.rowId)}"][data-table-column="${CSS.escape(current.columnId)}"] textarea`;
      const editor = contentRef.current?.querySelector<HTMLTextAreaElement>(selector)
        ?? document.querySelector<HTMLTextAreaElement>(selector);
      editor?.focus();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const rowIndex = sourceTable.rows.findIndex((row) => row.id === current.rowId);
    const columnIndex = sourceTable.columns.indexOf(current.columnId);
    const row = sourceTable.rows[clamp(rowIndex + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0), 0, sourceTable.rows.length - 1)];
    const columnId = sourceTable.columns[clamp(columnIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), 0, sourceTable.columns.length - 1)];
    const focus = { rowId: row.id, columnId };
    onRangeSelect({ kind, anchor: event.shiftKey ? tableRange?.anchor ?? position : focus, focus });
  };
  const selectionButton = (kind: TableRangeSelection['kind'], position: TableCellPosition, label: string, style?: CSSProperties) => (
    <button type="button" key={`${kind}:${position.rowId}:${position.columnId}`}
      className={`table-select-${kind}`} aria-label={label}
      title={`${label}. Перетащите для выделения диапазона. Shift + стрелки — расширить, F2 — редактировать.`}
      data-table-id={element.id} data-table-row={position.rowId} data-table-column={position.columnId}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail === 0) onRangeSelect({ kind, anchor: position, focus: position });
      }}
      onKeyDown={(event) => selectionKeyDown(event, kind, position)}
      onPointerDown={(event) => startSelection(event, kind, position)}
      onPointerMove={moveSelection} onPointerUp={stopSelection} onPointerCancel={stopSelection}
      onLostPointerCapture={stopSelection}
    />
  );
  return { selectionButton, selectionKeyDown, startSelection, moveSelection, stopSelection };
};
