export {
  ICON_NAMES,
  DEFAULT_LAYER_ID,
  assetSchema,
  colorSchema,
  elementSchema,
  fieldStyleSchema,
  iconNameSchema,
  imageElementSchema,
  migrateProject,
  pageSchema,
  projectSchema,
  rectSchema,
  schemaVersion,
  selectFieldElementSchema,
  selectOptionSchema,
  shapeElementSchema,
  shapeKindSchema,
  shapeStyleSchema,
  strokeStyleSchema,
  serializeProject,
  tableCellSchema,
  tableRowSchema,
  tableSchema,
  tableStyleSchema,
  textAlignSchema,
  verticalAlignSchema,
  textElementSchema,
  textFieldElementSchema,
  textStyleSchema
} from '@/shared/projectSchema';

export type {
  IconName,
  KpAsset,
  KpElement,
  KpImageElement,
  KpLayer,
  KpPage,
  KpPageBackground,
  KpProject,
  KpRect,
  KpSelectFieldElement,
  KpSelectOption,
  KpShapeElement,
  KpTableCell,
  KpTableElement,
  KpTableStyle,
  KpTableRow,
  KpTextElement,
  KpTextFieldElement,
  ShapeKind,
  TextAlign,
  VerticalAlign
} from '@/shared/projectSchema';

import type { KpPageBackground } from '@/shared/projectSchema';

export type KpBackground = KpPageBackground;
export type RenderMode = 'edit' | 'preview' | 'print';
export type KpPageBackgroundType = NonNullable<KpPageBackground>;

export const DEFAULT_ZOOM = 1;
export const PAGE_MARGIN_MM = 8;
export const TABLE_HEADER_HEIGHT_MM = 7;
export const TABLE_ROW_HEIGHT_MM = 9;
export const MIN_ELEMENT_MM_SIZE = 4;
export const MAX_TABLE_ROWS_PER_PAGE_ESTIMATE = 220;

export const A4_SIZE_MM = {
  width: 210,
  height: 297
} as const;

export const mmToPx = (mm: number, dpi = 96, zoom = 1): number => (mm * dpi * zoom) / 25.4;
export const pxToMm = (px: number, dpi = 96, zoom = 1): number => (px * 25.4) / (dpi * zoom);

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const calculateTableHeightMm = (
  _columns: number,
  rows: number,
  showPageHeader = true,
  rowHeightPx = 34
): number =>
  (showPageHeader ? TABLE_HEADER_HEIGHT_MM : 0) + (rows * TABLE_ROW_HEIGHT_MM * (rowHeightPx / 34)) + 4;

export const calculateTableRowsHeightMm = (
  rowHeightsPx: number[],
  showPageHeader = true
): number =>
  (showPageHeader ? TABLE_HEADER_HEIGHT_MM : 0) +
  rowHeightsPx.reduce((sum, rowHeightPx) => sum + TABLE_ROW_HEIGHT_MM * (rowHeightPx / 34), 0) +
  4;

export const calculateTableRowHeightPx = (
  tableHeightMm: number,
  rows: number,
  showPageHeader = true
): number => {
  const fixedHeightMm = (showPageHeader ? TABLE_HEADER_HEIGHT_MM : 0) + 4;
  return (Math.max(0, tableHeightMm - fixedHeightMm) * 34) / (Math.max(1, rows) * TABLE_ROW_HEIGHT_MM);
};

export const estimateMaxRowsOnPage = (
  pageHeightMm: number,
  tableTopY: number,
  showPageHeader = true,
  rowHeightPx = 34
): number => {
  const headerHeight = showPageHeader ? TABLE_HEADER_HEIGHT_MM : 0;
  const rowHeightMm = TABLE_ROW_HEIGHT_MM * (rowHeightPx / 34);
  return Math.max(1, Math.floor(Math.max(0, pageHeightMm - tableTopY - PAGE_MARGIN_MM - headerHeight) / rowHeightMm));
};
