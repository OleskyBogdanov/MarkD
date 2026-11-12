import { writeFileSync } from 'node:fs';
import { catalogHeaders, createWorkbookBuffer, type FixtureCell } from '../../src/main/import/__tests__/xlsxFixture';

export const writeExcelFixture = (path: string, productCount = 2, sheetCount = 1): void => {
  const products: FixtureCell[][] = Array.from({ length: productCount }, (_, index) => [
    `AD-TEST-${index + 1}`, 'TestEngine', 2, 3, 20, 25, 22, `ENGINE-${index + 1}`,
    `ALTERNATOR-${index + 1}`, 450000, 515899, 45000, '100А',
    '1500 × 700 × 1000', '1900 × 900 × 1200', 520, 680
  ]);
  writeFileSync(path, createWorkbookBuffer(Array.from({ length: sheetCount }, (_, index) => ({
    name: `Прайс ${index + 1}`,
    rows: [
      ...catalogHeaders, ['Раздел'], ...products,
      ['ИТОГО на складе', null, null, 70], ['Примечание']
    ]
  }))));
};
