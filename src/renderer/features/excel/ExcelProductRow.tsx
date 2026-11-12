import { Check } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/renderer/components/ui/button';
import type { ExcelCatalogProduct } from '@/shared/excelCatalog';
import { formatExcelMoney, type ExcelProductChoice } from './excelTableFill';
import { excelProductColumns } from './excelProductColumns';

type ExcelProductRowProps = {
  readonly product: ExcelCatalogProduct;
  readonly choice: ExcelProductChoice | undefined;
  readonly onChange: (choice: ExcelProductChoice | undefined) => void;
};

export const ExcelProductRow = ({ product, choice, onChange }: ExcelProductRowProps) => {
  const quantityErrorId = useId();
  const variant = choice?.variant ?? (product.enclosedPriceKopecks !== null ? 'enclosed' : 'open');
  const price = variant === 'enclosed' ? product.enclosedPriceKopecks : product.openPriceKopecks;
  const stock = product.openStock === null && product.enclosedStock === null
    ? '—' : (BigInt(product.openStock ?? 0) + BigInt(product.enclosedStock ?? 0)).toString();
  const selected = choice !== undefined;
  const quantityInvalid = choice !== undefined && (!Number.isSafeInteger(choice.quantity) || choice.quantity <= 0);
  const update = (patch: Partial<ExcelProductChoice>): void => {
    if (choice) onChange({ ...choice, ...patch });
  };

  return <tr data-selected={selected} aria-selected={selected}>
    <td>
      <strong>{product.model || `Строка ${product.sourceRow}`}</strong>
      {product.issues.length ? <span className="excel-field-error">{product.issues.join('. ')}</span> : null}
    </td>
    <td>
      <select aria-label={`Исполнение ${product.model}`} value={variant}
        disabled={!selected} onChange={event => {
          const value = event.currentTarget.value;
          if (value === 'open' || value === 'enclosed') update({ variant: value });
        }}>
        <option value="open" disabled={product.openPriceKopecks === null}>
          Открытая{product.openPriceKopecks === null ? ' — нет цены' : ''}
        </option>
        <option value="enclosed" disabled={product.enclosedPriceKopecks === null}>
          Кожух{product.enclosedPriceKopecks === null ? ' — нет цены' : ''}
        </option>
      </select>
    </td>
    <td className="excel-number">{stock}</td>
    <td className="excel-number">{product.openStock ?? '—'}</td>
    <td className="excel-number">{product.enclosedStock ?? '—'}</td>
    <td className="excel-number">{price === null ? 'Нет цены' : formatExcelMoney(price)}</td>
    <td>
      <label className="excel-avr-choice">
        <input type="checkbox" checked={choice?.withAvr ?? false} disabled={!selected}
          aria-label={`С АВР ${product.model}`}
          onChange={event => update({ withAvr: event.currentTarget.checked })} />
        <span>С АВР</span>
      </label>
      <span className="excel-product-engine">
        {product.avrPriceKopecks === null ? 'Нет цены АВР' : `+ ${formatExcelMoney(product.avrPriceKopecks)} ₽`}
        {product.avrRating ? ` · ${product.avrRating}` : ''}
      </span>
    </td>
    <td>
      <input className="excel-quantity" type="number" min={1} step={1}
        aria-label={`Количество ${product.model}`}
        aria-invalid={quantityInvalid} aria-describedby={quantityInvalid ? quantityErrorId : undefined}
        value={choice && !Number.isFinite(choice.quantity) ? '' : choice?.quantity ?? 1} disabled={!selected}
        onChange={event => update({ quantity: event.currentTarget.valueAsNumber })} />
      {quantityInvalid ? <span id={quantityErrorId} className="excel-field-error">Целое число больше 0</span> : null}
    </td>
    {excelProductColumns.map(column => {
      const value = product[column.key];
      return <td key={column.key} className={typeof value === 'number' ? 'excel-number' : undefined}>
        {typeof value === 'number' && column.money ? formatExcelMoney(value) : value === '' || value === null ? '—' : value}
      </td>;
    })}
    <td>
      <Button type="button" variant="outline" className="excel-select-product"
        aria-label={`${selected ? 'Выбрано' : 'Выбрать'} ${product.model}`} aria-pressed={selected}
        onClick={() => onChange(selected ? undefined : {
          productId: product.id, variant, withAvr: false, quantity: 1
        })}>
        {selected ? <Check size={14} aria-hidden="true" /> : null}
        {selected ? 'Выбрано' : 'Выбрать'}
      </Button>
    </td>
  </tr>;
};
