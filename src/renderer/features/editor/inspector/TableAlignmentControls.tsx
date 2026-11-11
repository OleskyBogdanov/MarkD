import { AlignCenter, AlignLeft, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from 'lucide-react';
import type { KpTableElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { selectedTableCells, type TableCellPosition } from '@/renderer/domain/tableSelection';
import { resolveTableCellStyle } from '@/renderer/domain/tableStyle';

type TableAlignmentControlsProps = {
  readonly element: KpTableElement;
  readonly pageId: string;
  readonly cell?: TableCellPosition;
};

export const TableAlignmentControls = ({ element, pageId }: TableAlignmentControlsProps) => {
  const selected = useEditorStore((state) => state.selected);
  const selection = selected.type === 'element' && selected.elementId === element.id ? selected : undefined;
  const cells = new Set(selectedTableCells(element, selection?.tableRange, selection?.tableCell).map((cell) => cell.id));
  const styles = element.rows.flatMap((row) => row.cells.flatMap((cell, index) =>
    cells.has(cell.id) ? [resolveTableCellStyle(element, row.id, element.columns[index])] : []));
  const update = useEditorStore.getState().updateTableSelectionStyle;
  return (
    <div className="table-alignment-tools" role="group" aria-label="Выравнивание выбранных ячеек">
      <div className="segmented-control segmented-control-wide" role="group" aria-label="Выравнивание текста">
        {([
          ['left', AlignLeft, 'По левому краю'],
          ['center', AlignCenter, 'По центру'],
          ['right', AlignRight, 'По правому краю']
        ] as const).map(([align, Icon, label]) => {
          const active = styles.length > 0 && styles.every((style) => style.align === align);
          return <button type="button" key={align} aria-label={label} title={label} aria-pressed={active}
            className={active ? 'active' : ''} onClick={() => update(pageId, element.id, { align })}><Icon size={15} aria-hidden="true" /></button>;
        })}
      </div>
      <div className="segmented-control segmented-control-wide" role="group" aria-label="Вертикальное выравнивание">
        {([
          ['top', AlignStartVertical, 'По верхнему краю'],
          ['middle', AlignCenterVertical, 'По середине'],
          ['bottom', AlignEndVertical, 'По нижнему краю']
        ] as const).map(([verticalAlign, Icon, label]) => {
          const active = styles.length > 0 && styles.every((style) => style.verticalAlign === verticalAlign);
          return <button type="button" key={verticalAlign} aria-label={label} title={label} aria-pressed={active}
            className={active ? 'active' : ''} onClick={() => update(pageId, element.id, { verticalAlign })}><Icon size={15} aria-hidden="true" /></button>;
        })}
      </div>
    </div>
  );
};
