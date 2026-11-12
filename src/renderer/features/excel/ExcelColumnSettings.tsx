import { useId } from 'react';
import type { ExcelTableColumn } from './excelTableFill';
import type { ExcelColumnAssignment, ExcelColumnSource, TableColumnMapping } from './excelColumnMapping';

const options: readonly { value: ExcelColumnSource; label: string }[] = [
  { value: 'skip', label: 'Не заполнять' },
  { value: 'number', label: 'Порядковый номер' },
  { value: 'name', label: 'Наименование' },
  { value: 'unit', label: 'Единица измерения' },
  { value: 'price', label: 'Цена, р.' },
  { value: 'quantity', label: 'Количество' },
  { value: 'total', label: 'Сумма, р.' }
];

type ExcelColumnSettingsProps = {
  readonly columns: readonly ExcelTableColumn[];
  readonly mapping: TableColumnMapping;
  readonly onChange: (columnId: string, assignment: ExcelColumnAssignment) => void;
};

export const ExcelColumnSettings = ({ columns, mapping, onChange }: ExcelColumnSettingsProps) => {
  const errorId = useId();
  return <div className="excel-column-mapping" role="group" aria-label="Настройка вставки">
    {columns.map((column, index) => {
      const assignment = mapping[column.id];
      const unitInvalid = assignment.source === 'unit' && !assignment.value.trim();
      return <div key={column.id} className="excel-column-setting">
        <label className="excel-field">
          <span>{index + 1}. {column.label}</span>
          <select aria-label={`Заполнение колонки ${index + 1}: ${column.label}`} value={assignment.source}
            onChange={event => {
              const source = options.find(option => option.value === event.currentTarget.value)?.value;
              if (source) onChange(column.id, source === 'unit' ? { source, value: 'шт.' } : { source });
            }}>
            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {assignment.source === 'unit' ? <label className="excel-field">Единица
          <input type="text" maxLength={64} value={assignment.value}
            aria-label={`Единица для колонки ${index + 1}: ${column.label}`}
            aria-invalid={unitInvalid} aria-describedby={unitInvalid ? `${errorId}-${index}` : undefined}
            onChange={event => onChange(column.id, { source: 'unit', value: event.currentTarget.value })} />
          {unitInvalid ? <span id={`${errorId}-${index}`} className="excel-field-error">
            Укажите единицу измерения.
          </span> : null}
        </label> : null}
      </div>;
    })}
  </div>;
};
