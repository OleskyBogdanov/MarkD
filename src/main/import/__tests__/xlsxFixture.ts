import { deflateRawSync } from 'node:zlib';

export type FixtureCell = string | number | null | { formula: string; cached: number } | { error: string };
export type FixtureSheet = { name: string; rows: FixtureCell[][]; dimension?: string; extraXml?: string };

export const catalogHeaders: FixtureCell[][] = [
  ['Прайс'],
  [],
  ['Модель ДГУ', 'Двигатель', 'Склад (Москва)', null, 'Номинальная мощность, кВт', 'Номинальная мощность, кВА',
    'Резервная мощность, кВт', 'Модель двигателя', 'Модель альтернатора',
    'Цена открытой ДГУ, с НДС 22%', 'Цена ДГУ без АВР, руб. с НДС 22%', 'Цена АВР, с НДС 22%', 'Мощность АВР, А',
    'Габариты открытой ДГУ, мм', 'Габариты ДГУ в кожухе, мм', 'Масса открытой ДГУ, кг', 'Масса ДГУ в кожухе, кг'],
  [null, null, 'Открытые', 'Кожух']
];

export const productRow: FixtureCell[] = [
  'AD-20-R', 'Ricardo', null, 3, null, null, null, 'ZH4100D', null, null, 515899, 45000, '100А'
];

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index: number): string {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + (value - 1) % 26) + result;
  }
  return result;
}

// Minimal ZIP writer for synthetic tests only. It creates real deflated ZIP
// records and CRCs, without bringing a spreadsheet writer into the application.
export function zipFixture(entries: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const bytes = Buffer.from(text);
    const compressed = deflateRawSync(bytes);
    const fileName = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    local.push(header, fileName, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(fileName.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, fileName);
    offset += header.length + fileName.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export function workbookEntries(sheets: FixtureSheet[]): Record<string, string> {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const entries: Record<string, string> = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) =>
      `<Relationship Id="rId${index + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`
  };
  sheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, column) => {
      if (cell === null) return '';
      const address = `${columnName(column)}${rowIndex + 1}`;
      if (typeof cell === 'number') return `<c r="${address}"><v>${cell}</v></c>`;
      if (typeof cell === 'string') return `<c r="${address}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
      if ('formula' in cell) return `<c r="${address}"><f>${escapeXml(cell.formula)}</f><v>${cell.cached}</v></c>`;
      return `<c r="${address}" t="e"><v>${escapeXml(cell.error)}</v></c>`;
    }).join('')}</row>`).join('');
    entries[`xl/worksheets/sheet${index + 1}.xml`] = `<worksheet xmlns="${ns}"><dimension ref="${sheet.dimension ?? `A1:Q${Math.max(sheet.rows.length, 4)}`}"/><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="C3:D3"/></mergeCells>${sheet.extraXml ?? ''}</worksheet>`;
  });
  return entries;
}

export function createWorkbookBuffer(sheets: FixtureSheet[] = [{
  name: 'Прайс для дилеров',
  rows: [...catalogHeaders, ['Раздел Ricardo'], productRow, ['ИТОГО на складе'], ['Примечание']]
}]): Buffer {
  return zipFixture(workbookEntries(sheets));
}
