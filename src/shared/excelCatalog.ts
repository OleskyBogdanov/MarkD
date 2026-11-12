import { z } from 'zod';

const catalogText = z.string().max(4096);
const optionalAmount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();

export const excelCatalogProductSchema = z.object({
  id: z.string().min(1),
  sourceRow: z.number().int().positive().max(2000),
  model: catalogText,
  engineBrand: catalogText,
  engineModel: catalogText,
  nominalPowerKw: catalogText.default(''),
  nominalPowerKva: catalogText.default(''),
  standbyPowerKw: catalogText.default(''),
  alternatorModel: catalogText.default(''),
  openDimensionsMm: catalogText.default(''),
  enclosedDimensionsMm: catalogText.default(''),
  openWeightKg: catalogText.default(''),
  enclosedWeightKg: catalogText.default(''),
  openStock: optionalAmount,
  enclosedStock: optionalAmount,
  openPriceKopecks: optionalAmount,
  enclosedPriceKopecks: optionalAmount,
  avrPriceKopecks: optionalAmount,
  avrRating: catalogText,
  issues: z.array(catalogText).max(16)
});

export const excelCatalogSheetSchema = z.object({
  id: z.string().min(1),
  name: catalogText.min(1),
  products: z.array(excelCatalogProductSchema).min(1).max(2000)
});

export const excelCatalogSchema = z.object({
  fileName: catalogText.min(1),
  sheets: z.array(excelCatalogSheetSchema).min(1).max(16)
});

export type ExcelCatalog = z.infer<typeof excelCatalogSchema>;
export type ExcelCatalogSheet = ExcelCatalog['sheets'][number];
export type ExcelCatalogProduct = ExcelCatalogSheet['products'][number];
