import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/renderer/components/ui/button';
import type { ExcelCatalog } from '@/shared/excelCatalog';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';
import {
  getExcelTableTargets, prepareExcelRows, type ExcelProductChoice
} from './excelTableFill';
import { getExcelRowCells, suggestExcelColumnMapping,
  type TableColumnMapping } from './excelColumnMapping';
import { ExcelProductRow } from './ExcelProductRow';
import { excelProductColumns } from './excelProductColumns';
import { ExcelColumnSettings } from './ExcelColumnSettings';
import { measureExcelRows } from './measureExcelRows';
import './excel-table-fill.css';

type ExcelTableFillDialogProps = {
  readonly catalog: ExcelCatalog;
  readonly sessionId: number;
  readonly onClose: () => void;
};

export const ExcelTableFillDialog = ({ catalog, sessionId, onClose }: ExcelTableFillDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const project = useEditorStore(state => state.project);
  const targets = getExcelTableTargets(project);
  const initialTarget = targets.find(target => target.unavailableReason === null);
  const [sheetId, setSheetId] = useState(catalog.sheets[0]?.id ?? '');
  const [choices, setChoices] = useState<readonly ExcelProductChoice[]>([]);
  const [tableId, setTableId] = useState(initialTarget?.tableId ?? '');
  const [mapping, setMapping] = useState<TableColumnMapping>(() =>
    suggestExcelColumnMapping(initialTarget?.columns ?? []));
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dismissed = useRef(false);
  const sheet = catalog.sheets.find(candidate => candidate.id === sheetId);
  const target = targets.find(candidate => candidate.tableId === tableId);
  let selectionError = '';
  let rows: ReturnType<typeof prepareExcelRows> = [];
  if (sheet && choices.length) {
    try { rows = prepareExcelRows(sheet, choices); }
    catch (error) { selectionError = error instanceof Error ? error.message : String(error); }
  }
  let mappingError = '';
  let cells: readonly (readonly string[])[] = [];
  if (target && target.unavailableReason === null) {
    try { cells = getExcelRowCells(target.table, mapping, rows); }
    catch (error) { mappingError = error instanceof Error ? error.message : String(error); }
  }
  const canSubmit = rows.length > 0 && !selectionError && target?.unavailableReason === null && !mappingError;

  useEffect(() => {
    dismissed.current = false;
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dismissed.current = true;
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  const close = (): void => {
    dismissed.current = true;
    onClose();
  };

  const submit = async (): Promise<void> => {
    if (!canSubmit || !target || submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      flushPendingEdits();
      await document.fonts.ready;
      if (dismissed.current) return;
      const state = useEditorStore.getState();
      if (state.sessionId !== sessionId) throw new Error('Документ изменился. Откройте выбор позиций заново.');
      const table = state.project.pages.find(page => page.id === target.pageId)?.elements
        .find(element => element.id === target.tableId && element.type === 'table');
      if (!table || table.type !== 'table') throw new Error('Таблица удалена. Выберите другую таблицу.');
      const fittedRows = measureExcelRows(table, mapping, rows);
      state.setActiveLayer(target.layerId);
      useEditorStore.getState().insertExcelRows({
        sessionId, pageId: target.pageId, tableId: target.tableId, mapping, rows: fittedRows
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
      submitting.current = false;
      setPending(false);
    }
  };

  return <dialog ref={dialogRef} className="excel-fill-dialog"
    aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); close(); }}>
    <form className="excel-fill-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <header className="excel-fill-header">
        <h2 id={titleId}>Заполнить таблицу из Excel</h2>
        <p id={descriptionId}>{catalog.fileName}</p>
      </header>
      <div className="excel-fill-body">
        {catalog.sheets.length > 1 ? <label className="excel-field">Лист Excel
          <select value={sheetId} onChange={event => {
            setSheetId(event.currentTarget.value); setChoices([]); setSubmitError('');
          }}>
            {catalog.sheets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label> : null}
        <section aria-label="Позиции Excel">
          <div className="excel-catalog-scroll" tabIndex={0} aria-label="Каталог Excel">
            <table className="excel-catalog-table">
              <caption className="sr-only">Позиции листа {sheet?.name}; цены в рублях, с НДС</caption>
              <thead><tr>
                <th scope="col">Модель ДГУ</th><th scope="col">Исполнение</th>
                <th scope="col">На складе</th>
                <th scope="col">Открытая: склад, шт.</th><th scope="col">Кожух: склад, шт.</th>
                <th scope="col">Цена, ₽</th>
                <th scope="col">АВР</th><th scope="col">Количество</th>
                {excelProductColumns.map(column => <th key={column.key} scope="col">{column.label}</th>)}
                <th scope="col">Выбор</th>
              </tr></thead>
              <tbody>{sheet?.products.map(product => <ExcelProductRow key={product.id} product={product}
                choice={choices.find(choice => choice.productId === product.id)}
                onChange={next => {
                  setChoices(current => [
                    ...current.filter(choice => choice.productId !== product.id), ...(next ? [next] : [])
                  ]);
                  setSubmitError('');
                }} />)}</tbody>
            </table>
          </div>
        </section>
        <section className="excel-destination" aria-label="Куда вставить позиции">
          <label className="excel-field">Таблица документа
            <select value={tableId} onChange={event => {
              const next = targets.find(item => item.tableId === event.currentTarget.value);
              setTableId(next?.tableId ?? '');
              setMapping(suggestExcelColumnMapping(next?.columns ?? []));
              setSubmitError('');
            }}>
              <option value="">Выберите таблицу</option>
              {targets.map(item => <option key={item.tableId} value={item.tableId}
                disabled={item.unavailableReason !== null}>
                {item.label}{item.unavailableReason ? ` — ${item.unavailableReason}` : ''}
              </option>)}
            </select>
          </label>
          {!initialTarget ? <p className="excel-field-error">
            Нет доступных таблиц. Нужна таблица на видимом разблокированном слое
            с одинаковым количеством ячеек в каждой строке.
          </p> : null}
          {target ? <>
            <p className="excel-fill-note">Выберите значение для каждой колонки выбранной таблицы.
              Колонки с настройкой «Не заполнять» останутся пустыми в новых строках.</p>
            <ExcelColumnSettings columns={target.columns} mapping={mapping} onChange={(columnId, assignment) => {
              setMapping(current => ({ ...current, [columnId]: assignment }));
              setSubmitError('');
            }} />
          </> : null}
          {mappingError ? <p className="excel-field-error">{mappingError}</p> : null}
          <p className="excel-fill-note">Позиции будут добавлены в конец таблицы. Существующие строки сохранятся.</p>
        </section>
        <section aria-label="Предпросмотр вставки" className="excel-fill-preview">
          <h3>Будет добавлено: {rows.length}</h3>
          <p className="excel-fill-note">АВР включается в цену. Сумма рассчитывается при вставке.</p>
          {cells.length && target ? <div className="excel-preview-scroll" tabIndex={0} aria-label="Значения для вставки">
            <table>
              <thead><tr>{target.columns.map(column =>
                <th key={column.id} scope="col">{column.label}</th>)}</tr></thead>
              <tbody>{cells.map((row, index) => <tr key={index}>
                {row.map((text, columnIndex) => <td key={target.columns[columnIndex].id}
                  className={mapping[target.columns[columnIndex].id].source === 'name'
                    ? 'excel-preview-name' : 'excel-preview-value'}>{text}</td>)}
              </tr>)}</tbody>
            </table>
          </div> : <p className="excel-fill-note">{rows.length
            ? 'Выберите таблицу и настройте заполнение её колонок.' : 'Выберите позиции из каталога.'}</p>}
        </section>
        <p className="excel-field-error" role="alert">{submitError || selectionError}</p>
      </div>
      <footer className="excel-fill-footer">
        <span role="status">Выбрано позиций: {choices.length}</span>
        <div>
          <Button type="button" variant="ghost" onClick={close}>Отмена</Button>
          <Button type="submit" className="excel-fill-submit" disabled={!canSubmit || pending} aria-busy={pending}>Готово</Button>
        </div>
      </footer>
    </form>
  </dialog>;
};
