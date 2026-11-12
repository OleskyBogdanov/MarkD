import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
import { Worker } from 'node:worker_threads';
import { SaxesParser } from 'saxes';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import {
  excelCatalogSchema, type ExcelCatalog, type ExcelCatalogProduct, type ExcelCatalogSheet
} from '../../shared/excelCatalog.js';

export const EXCEL_IMPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  expandedBytes: 16 * 1024 * 1024,
  entries: 256,
  sheets: 16,
  rows: 2000,
  columns: 32,
  cells: 64000,
  textLength: 4096
} as const;

const requiredColumns = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q']);
const normalize = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\s+/gu, ' ').trim() : '';

function checkAddress(address: string): void {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(address);
  if (!match) throw new Error('Некорректный адрес ячейки Excel');
  const column = [...match[1]].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
  if (column > EXCEL_IMPORT_LIMITS.columns || Number(match[2]) > EXCEL_IMPORT_LIMITS.rows) {
    throw new Error('Превышен лимит размеров листа Excel (2000 строк, 32 колонки)');
  }
}

// Inspect the same immutable bytes later passed to the workbook parser. No files
// are extracted, and yauzl validates actual streamed sizes against ZIP metadata.
async function inspectArchive(buffer: Buffer): Promise<void> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, result) => error ? reject(error) : resolve(result));
  });
  await new Promise<void>((resolve, reject) => {
    let expanded = 0;
    let declared = 0;
    let entries = 0;
    let sheets = 0;
    let cells = 0;
    const names = new Set<string>();
    const fail = (error: unknown): void => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('end', resolve);
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        if (++entries > EXCEL_IMPORT_LIMITS.entries || names.has(entry.fileName)) {
          throw new Error('Превышен лимит файлов Excel или найдены повторяющиеся записи ZIP');
        }
        names.add(entry.fileName);
        declared += entry.uncompressedSize;
        if (declared > EXCEL_IMPORT_LIMITS.expandedBytes) throw new Error('Превышен лимит распакованного Excel (16 МиБ)');
        if (entry.generalPurposeBitFlag & 1) throw new Error('Зашифрованный Excel не поддерживается');
        const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => {
          zip.openReadStream(entry, (error, result) => error ? rej(error) : res(result));
        });
        const parser = entry.fileName.endsWith('.xml') || entry.fileName.endsWith('.rels')
          ? new SaxesParser({ xmlns: true }) : null;
        const decoder = new StringDecoder('utf8');
        let cell = '';
        let depth = 0;
        let valueLength = 0;
        let valueDepth = 0;
        parser?.on('doctype', () => { throw new Error('DTD в Excel не поддерживается'); });
        parser?.on('opentag', tag => {
          if (++depth > 64) throw new Error('Превышен лимит вложенности XML Excel');
          for (const attribute of Object.values(tag.attributes)) {
            if (attribute.value.length > EXCEL_IMPORT_LIMITS.textLength) throw new Error('Превышен лимит длины значения Excel');
          }
          const attr = (name: string): string => tag.attributes[name]?.value ?? '';
          if (tag.local === 'sheet' && ++sheets > EXCEL_IMPORT_LIMITS.sheets) {
            throw new Error('Превышен лимит листов Excel (16)');
          }
          if (tag.local === 'dimension' || tag.local === 'mergeCell') {
            for (const address of attr('ref').split(':')) checkAddress(address);
          }
          // Drawing anchors have <row> text nodes without r attributes. The
          // reader strips namespaces, so address/dimension checks below must
          // still apply to cells regardless of their declared namespace.
          if (tag.local === 'row'
            && (attr('r') || tag.uri === 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
            && (!/^[1-9]\d*$/.test(attr('r')) || Number(attr('r')) > EXCEL_IMPORT_LIMITS.rows)) {
            throw new Error('Превышен лимит строк Excel');
          }
          if (tag.local === 'c') {
            cell = attr('r');
            checkAddress(cell);
            if (++cells > EXCEL_IMPORT_LIMITS.cells) throw new Error('Превышен лимит ячеек Excel');
            const column = cell.replace(/\d+$/, '');
            if (attr('t') === 'e' && requiredColumns.has(column)) throw new Error(`Ошибка Excel в ячейке ${cell}`);
          }
          if (tag.local === 'f' && requiredColumns.has(cell.replace(/\d+$/, ''))) {
            throw new Error(`Формула в обязательной ячейке ${cell}: замените её значением`);
          }
          if (tag.local === 'si' || tag.local === 'is' || tag.local === 'v') {
            valueDepth = depth;
            valueLength = 0;
          }
        });
        parser?.on('text', text => {
          if (valueDepth) {
            valueLength += text.length;
            if (valueLength > EXCEL_IMPORT_LIMITS.textLength) throw new Error('Превышен лимит длины значения Excel');
          }
        });
        parser?.on('closetag', tag => {
          if (tag.local === 'c') cell = '';
          if (depth === valueDepth) valueDepth = 0;
          depth--;
        });
        try {
          for await (const chunk of stream) {
            const bytes = chunk as Buffer;
            expanded += bytes.length;
            if (expanded > EXCEL_IMPORT_LIMITS.expandedBytes) throw new Error('Превышен лимит распакованного Excel (16 МиБ)');
            if (parser) {
              // Yield between bounded SAX chunks, including highly compressible XML.
              for (let offset = 0; offset < bytes.length; offset += 16384) {
                parser.write(decoder.write(bytes.subarray(offset, offset + 16384)));
                await new Promise<void>(res => setImmediate(res));
              }
            }
          }
          parser?.write(decoder.end()).close();
        } finally {
          (stream as import('node:stream').Readable).destroy();
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

type WorkbookSheet = { sheet: string; data: unknown[][] };

function parseWorkbook(buffer: Buffer): Promise<WorkbookSheet[]> {
  return new Promise((resolve, reject) => {
    // The universal reader uses the central directory (as yauzl does), rather
    // than trusting a separate set of local ZIP headers during a second unzip.
    const worker = new Worker(`
      (async () => {
        const { parentPort, workerData } = await import('node:worker_threads');
        const { pathToFileURL } = await import('node:url');
        const { default: read } = await import(pathToFileURL(workerData.module).href);
        const bytes = workerData.bytes;
        const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        parentPort.postMessage(await read(input, { parseNumber: value => value }));
      })().catch(error => { throw error; });
    `, {
      eval: true,
      workerData: { module: createRequire(import.meta.url).resolve('read-excel-file/universal'), bytes: buffer },
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Превышено время чтения Excel (30 секунд)'));
    }, 30000);
    worker.once('message', (result: WorkbookSheet[]) => { clearTimeout(timer); resolve(result); void worker.terminate(); });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('Не удалось прочитать Excel: процесс чтения завершён'));
    });
  });
}

function isCompatible(rows: unknown[][]): boolean {
  const header = (index: number): string => normalize(rows[2]?.[index]).toLowerCase();
  return header(0) === 'модель дгу' && /^(двигатель|марка двигателя)$/.test(header(1))
    && header(2).startsWith('склад') && header(7) === 'модель двигателя'
    && /^цена открытой дгу(?:\s|$|[,.:])/.test(header(9)) && /^цена дгу без авр(?:\s|$|[,.:])/.test(header(10))
    && /^цена авр(?:\s|$|[,.:])/.test(header(11)) && /^мощность авр(?:\s|$|[,.:])/.test(header(12))
    && normalize(rows[3]?.[2]).toLowerCase() === 'открытые'
    && normalize(rows[3]?.[3]).toLowerCase() === 'кожух';
}

// Decimal half-up rounding, using the original numeric cell text rather than
// binary floating point. Missing values remain distinct from legitimate zero.
function amount(value: unknown, price: boolean, label: string, issues: string[]): number | null {
  const text = normalize(value);
  if (!text) return null;
  const compact = text.replace(/\s/g, '').replace(',', '.');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(compact);
  if (match) {
    const fraction = match[2] ?? '';
    if (price || !/[1-9]/.test(fraction)) {
      let result = BigInt(match[1]) * (price ? 100n : 1n);
      if (price) {
        result += BigInt((fraction + '00').slice(0, 2));
        if (fraction[2] && fraction[2] >= '5') result++;
      }
      if (result <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(result);
    }
  }
  issues.push(`${label}: некорректное значение «${text}»`);
  return null;
}

function productsForSheet(rows: unknown[][], id: string): ExcelCatalogProduct[] {
  const products: ExcelCatalogProduct[] = [];
  for (let index = 4; index < rows.length; index++) {
    const row = rows[index];
    const model = normalize(row[0]);
    if (/^итого(?:\s|$|[,.:])/iu.test(model)) break;
    // Section and note rows contain no engine/stock/price fields. A model-like
    // row is retained even when every other required field is malformed.
    const hasFields = [1, 2, 3, 7, 9, 10, 11].some(column => normalize(row[column]));
    if (!hasFields && (!model || /^(?:раздел|тр[её]хфазные|однофазные|примечани[ея])(?:\s|$)/iu.test(model))) continue;
    const issues: string[] = [];
    const engineBrand = normalize(row[1]);
    const engineModel = normalize(row[7]);
    if (!model) issues.push('Не указана модель ДГУ');
    if (!engineBrand) issues.push('Не указана марка двигателя');
    if (!engineModel) issues.push('Не указана модель двигателя');
    products.push({
      id: `${id}:row-${index + 1}`, sourceRow: index + 1, model, engineBrand, engineModel,
      nominalPowerKw: normalize(row[4]),
      nominalPowerKva: normalize(row[5]),
      standbyPowerKw: normalize(row[6]),
      alternatorModel: normalize(row[8]),
      openDimensionsMm: normalize(row[13]),
      enclosedDimensionsMm: normalize(row[14]),
      openWeightKg: normalize(row[15]),
      enclosedWeightKg: normalize(row[16]),
      openStock: amount(row[2], false, 'Остаток открытой ДГУ', issues),
      enclosedStock: amount(row[3], false, 'Остаток в кожухе', issues),
      openPriceKopecks: amount(row[9], true, 'Цена открытой ДГУ', issues),
      enclosedPriceKopecks: amount(row[10], true, 'Цена ДГУ в кожухе', issues),
      avrPriceKopecks: amount(row[11], true, 'Цена АВР', issues),
      avrRating: normalize(row[12]), issues
    });
  }
  return products;
}

export async function importExcelCatalog(filePath: string): Promise<ExcelCatalog> {
  if (extname(filePath).toLowerCase() !== '.xlsx') throw new Error('Выберите файл Excel .xlsx');
  const file = await open(filePath, 'r');
  let buffer: Buffer;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > EXCEL_IMPORT_LIMITS.fileBytes) throw new Error('Превышен лимит размера Excel (10 МиБ)');
    // A bounded read also handles a file growing after stat().
    buffer = Buffer.alloc(Math.min(stat.size + 1, EXCEL_IMPORT_LIMITS.fileBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > stat.size) throw new Error('Файл Excel изменился во время чтения');
    buffer = buffer.subarray(0, length);
  } finally {
    await file.close();
  }
  try {
    await inspectArchive(buffer);
    const workbook = await parseWorkbook(buffer);
    const sheets: ExcelCatalogSheet[] = [];
    workbook.forEach((sheet, index) => {
      if (!isCompatible(sheet.data)) return;
      const id = `sheet-${index + 1}`;
      const products = productsForSheet(sheet.data, id);
      if (products.length) sheets.push({ id, name: normalize(sheet.sheet), products });
    });
    if (!sheets.length) throw new Error('Нет подходящих листов с товарами: проверьте заголовки строк 3 и 4');
    return excelCatalogSchema.parse({ fileName: basename(filePath), sheets });
  } catch (error) {
    throw new Error(`Не удалось импортировать Excel: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
