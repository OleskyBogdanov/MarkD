import type { ExcelCatalogProduct } from '@/shared/excelCatalog';

type ExcelProductColumn = {
  readonly key: Exclude<keyof ExcelCatalogProduct, 'id' | 'sourceRow' | 'model' | 'issues'>;
  readonly label: string;
  readonly money?: boolean;
};

export const excelProductColumns: readonly ExcelProductColumn[] = [
  { key: 'engineBrand', label: 'Марка двигателя' },
  { key: 'engineModel', label: 'Модель двигателя' },
  { key: 'nominalPowerKw', label: 'Номинальная мощность, кВт' },
  { key: 'nominalPowerKva', label: 'Номинальная мощность, кВА' },
  { key: 'standbyPowerKw', label: 'Резервная мощность, кВт' },
  { key: 'alternatorModel', label: 'Модель альтернатора' },
  { key: 'avrPriceKopecks', label: 'Цена АВР, р.', money: true },
  { key: 'avrRating', label: 'Ток АВР, А' },
  { key: 'openDimensionsMm', label: 'Открытая: габариты, мм' },
  { key: 'enclosedDimensionsMm', label: 'Кожух: габариты, мм' },
  { key: 'openWeightKg', label: 'Открытая: масса, кг' },
  { key: 'enclosedWeightKg', label: 'Кожух: масса, кг' }
];
