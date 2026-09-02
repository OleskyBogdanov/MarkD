import { z } from 'zod';
import { DEFAULT_FONT_ID, FONT_IDS, ICON_NAMES } from './documentAssets.js';

export { DEFAULT_FONT_ID, FONT_IDS, ICON_NAMES } from './documentAssets.js';

export const schemaVersion = 4 as const;
export const DEFAULT_LAYER_ID = 'layer_main';

export const iconNameSchema = z.enum(ICON_NAMES);
export const fontIdSchema = z.enum(FONT_IDS);
export const textAlignSchema = z.enum(['left', 'center', 'right']);
export const verticalAlignSchema = z.enum(['top', 'middle', 'bottom']);
export const shapeKindSchema = z.enum(['rectangle', 'ellipse', 'triangle', 'line']);
export const strokeStyleSchema = z.enum(['solid', 'dashed', 'dotted']);
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Ожидается HEX-цвет');

export const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive()
});

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  order: z.number().int().nonnegative(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false)
});

export const textStyleSchema = z.object({
  fontId: fontIdSchema.default(DEFAULT_FONT_ID),
  fontSize: z.number().min(8).max(72).default(12),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: textAlignSchema.default('left'),
  color: colorSchema.default('#23241f')
});

export const fieldStyleSchema = z.object({
  fontId: fontIdSchema.default(DEFAULT_FONT_ID),
  fontSize: z.number().min(8).max(32).default(12),
  textColor: colorSchema.default('#23241f'),
  labelColor: colorSchema.default('#5e6159'),
  iconColor: colorSchema.default('#1e5b49'),
  backgroundColor: colorSchema.default('#fffefa'),
  borderColor: colorSchema.default('#c9cac2'),
  borderRadius: z.number().min(0).max(24).default(6),
  backgroundTransparent: z.boolean().default(false),
  borderVisible: z.boolean().default(true)
});

export const tableStyleSchema = z.object({
  fontId: fontIdSchema.default(DEFAULT_FONT_ID),
  textColor: colorSchema.default('#23241f'),
  backgroundColor: colorSchema.default('#fffefa'),
  headerTextColor: colorSchema.default('#ffffff'),
  headerBackgroundColor: colorSchema.default('#23241f'),
  headerRowTextColor: colorSchema.default('#23241f'),
  headerRowBackgroundColor: colorSchema.default('#eeeee8'),
  headerRowBold: z.boolean().default(true),
  alternatingRows: z.boolean().default(false),
  alternateRowColor: colorSchema.default('#f5f5f0'),
  borderColor: colorSchema.default('#b7b9b0'),
  borderVisible: z.boolean().default(true),
  borderWidth: z.number().min(0).max(6).default(1),
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  cellPadding: z.number().min(0).max(24).default(7),
  rowHeight: z.number().min(24).max(96).default(34),
  fontSize: z.number().min(8).max(24).default(11),
  verticalAlign: verticalAlignSchema.default('middle'),
  wrapText: z.boolean().default(true),
  align: textAlignSchema.default('left'),
  columnAlign: z.record(z.string(), textAlignSchema).default({}),
  rowAlign: z.record(z.string(), textAlignSchema).default({}),
  columnVerticalAlign: z.record(z.string(), verticalAlignSchema).default({}),
  rowVerticalAlign: z.record(z.string(), verticalAlignSchema).default({}),
  rowHeights: z.record(z.string(), z.number().min(24).max(96)).default({})
});

const commonElementShape = {
  id: z.string().min(1),
  rect: rectSchema,
  layerId: z.string().min(1).default(DEFAULT_LAYER_ID),
  zIndex: z.number().int().nonnegative().default(0)
};

export const textElementSchema = z.object({
  ...commonElementShape,
  type: z.literal('text'),
  text: z.string(),
  style: textStyleSchema
});

export const textFieldElementSchema = z.object({
  ...commonElementShape,
  type: z.literal('textField'),
  label: z.string(),
  showLabel: z.boolean().default(true),
  value: z.string(),
  placeholder: z.string(),
  showPlaceholder: z.boolean().default(true),
  iconName: iconNameSchema.optional(),
  textAlign: textAlignSchema.default('left'),
  verticalAlign: verticalAlignSchema.default('middle'),
  style: fieldStyleSchema
});

export const selectOptionSchema = z.object({ id: z.string().min(1), label: z.string() });

export const selectFieldElementSchema = z.object({
  ...commonElementShape,
  type: z.literal('selectField'),
  label: z.string(),
  placeholder: z.string(),
  options: z.array(selectOptionSchema).min(1),
  selectedOptionId: z.string().min(1).nullable(),
  style: fieldStyleSchema
});

export const imageElementSchema = z.object({
  ...commonElementShape,
  type: z.literal('image'),
  assetId: z.string().min(1)
});

export const shapeStyleSchema = z.object({
  fillColor: colorSchema.default('#dce9e3'),
  fillTransparent: z.boolean().default(false),
  strokeColor: colorSchema.default('#1e5b49'),
  strokeWidth: z.number().min(0).max(12).default(2),
  strokeStyle: strokeStyleSchema.default('solid'),
  cornerRadius: z.number().min(0).max(100).default(0)
});

export const shapeElementSchema = z.object({
  ...commonElementShape,
  type: z.literal('shape'),
  shape: shapeKindSchema,
  style: shapeStyleSchema,
  text: z.string().default(''),
  textStyle: textStyleSchema.prefault({ align: 'center' })
});

export const tableCellSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  widthMm: z.number().positive()
});
export const tableRowSchema = z.object({ id: z.string().min(1), cells: z.array(tableCellSchema).min(1) });

export const tableSchema = z.object({
  ...commonElementShape,
  type: z.literal('table'),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(tableRowSchema).min(1),
  pageHeader: z.string().default('Наименование'),
  showPageHeader: z.boolean().default(true),
  firstRowHeader: z.boolean().default(true),
  style: tableStyleSchema.prefault({})
});

export const elementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  textFieldElementSchema,
  selectFieldElementSchema,
  imageElementSchema,
  shapeElementSchema,
  tableSchema
]);

export const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  dataUrl: z.string().startsWith('data:')
});

export const pageSchema = z.object({
  id: z.string().min(1),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  background: z.discriminatedUnion('type', [
    z.object({ type: z.literal('color'), value: colorSchema }),
    z.object({ type: z.literal('image'), value: z.string().startsWith('data:') })
  ]).nullable().default(null),
  elements: z.array(elementSchema),
  flowStartYmm: z.number().nonnegative().default(8)
});

const metadataV4Schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdBy: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  renderProfileVersion: z.literal(1).default(1)
});

export const projectSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  metadata: metadataV4Schema,
  orientation: z.enum(['portrait', 'landscape']),
  layers: z.array(layerSchema).min(1),
  pages: z.array(pageSchema),
  assets: z.array(assetSchema),
  styles: z.record(z.string(), z.unknown()).default({})
}).superRefine((project, context) => {
  const layerIds = new Set(project.layers.map((layer) => layer.id));
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  if (layerIds.size !== project.layers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['layers'], message: 'ID слоёв должны быть уникальны' });
  }
  if (assetIds.size !== project.assets.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['assets'], message: 'ID ресурсов должны быть уникальны' });
  }

  project.pages.forEach((page, pageIndex) => {
    page.elements.forEach((element, elementIndex) => {
      const path = ['pages', pageIndex, 'elements', elementIndex];
      if (!layerIds.has(element.layerId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'layerId'], message: 'Слой элемента не существует' });
      }
      if (element.type === 'image' && !assetIds.has(element.assetId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'assetId'], message: 'Ресурс изображения не существует' });
      }
      if (element.type === 'selectField' && element.selectedOptionId && !element.options.some((option) => option.id === element.selectedOptionId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'selectedOptionId'], message: 'Выбранный вариант не существует' });
      }
      if (element.type === 'table') {
        const columnIds = new Set(element.columns);
        const rowIds = new Set(element.rows.map((row) => row.id));
        for (const columnId of Object.keys(element.style.columnAlign)) {
          if (!columnIds.has(columnId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'style', 'columnAlign', columnId], message: 'Колонка не существует' });
        }
        for (const rowId of Object.keys(element.style.rowAlign)) {
          if (!rowIds.has(rowId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'style', 'rowAlign', rowId], message: 'Строка не существует' });
        }
        for (const columnId of Object.keys(element.style.columnVerticalAlign)) {
          if (!columnIds.has(columnId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'style', 'columnVerticalAlign', columnId], message: 'Колонка не существует' });
        }
        for (const rowId of Object.keys(element.style.rowVerticalAlign)) {
          if (!rowIds.has(rowId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'style', 'rowVerticalAlign', rowId], message: 'Строка не существует' });
        }
        for (const rowId of Object.keys(element.style.rowHeights)) {
          if (!rowIds.has(rowId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'style', 'rowHeights', rowId], message: 'Строка не существует' });
        }
      }
    });
  });
});

const makeProjectId = (): string => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `project_${id}`;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

export const legacyFontFamilyToId = (fontFamily: unknown): z.infer<typeof fontIdSchema> => {
  if (typeof fontFamily !== 'string') return DEFAULT_FONT_ID;
  const normalized = fontFamily.toLowerCase();
  if (normalized.includes('avenir')) return 'manrope';
  if (normalized.includes('menlo') || normalized.includes('monaco') || normalized.includes('mono')) return 'jetbrains-mono';
  if (normalized.includes('arial') || normalized.includes('sans')) return 'noto-sans';
  if (normalized.includes('georgia') || normalized.includes('times') || normalized.includes('serif')) return 'pt-serif';
  return DEFAULT_FONT_ID;
};

const migrateStyleFont = (style: unknown): unknown => {
  if (!isObject(style)) return style;
  if ('fontId' in style) return style;
  return { ...style, fontId: legacyFontFamilyToId(style['fontFamily']) };
};

const migrateElementFonts = (element: unknown): unknown => {
  if (!isObject(element)) return element;
  switch (element['type']) {
    case 'text':
    case 'textField':
    case 'selectField':
    case 'table':
      return { ...element, style: migrateStyleFont(element['style']) };
    case 'shape':
      return { ...element, textStyle: migrateStyleFont(element['textStyle']) };
    default:
      return element;
  }
};

const migratePages = (pages: unknown): unknown => {
  if (!Array.isArray(pages)) return pages;
  return pages.map((page) => {
    if (!isObject(page) || !Array.isArray(page['elements'])) return page;
    return { ...page, elements: page['elements'].map(migrateElementFonts) };
  });
};

export const migrateProject = (input: unknown): KpProject => {
  const version = typeof input === 'object' && input !== null && 'schemaVersion' in input
    ? (input as { schemaVersion?: unknown }).schemaVersion
    : undefined;

  if (version === schemaVersion) return projectSchema.parse(input);
  if (version === 1 || version === 2 || version === 3) {
    if (!isObject(input)) throw new Error('Неверная структура проекта.');
    const now = new Date().toISOString();
    const metadata = isObject(input['metadata']) ? input['metadata'] : {};
    const needsLegacyMetadata = version === 1 || version === 2;
    return projectSchema.parse({
      ...input,
      schemaVersion,
      metadata: {
        ...metadata,
        id: needsLegacyMetadata ? makeProjectId() : metadata['id'],
        createdAt: needsLegacyMetadata ? now : metadata['createdAt'],
        updatedAt: needsLegacyMetadata ? now : metadata['updatedAt'],
        renderProfileVersion: 1
      },
      layers: needsLegacyMetadata
        ? [{ id: DEFAULT_LAYER_ID, name: 'Основной', order: 0, visible: true, locked: false }]
        : input['layers'],
      pages: migratePages(input['pages'])
    });
  }
  if (typeof version === 'number' && version > schemaVersion) {
    throw new Error(`Неподдерживаемая версия проекта: ${version}`);
  }
  throw new Error('Неизвестная или отсутствующая версия проекта.');
};

export const serializeProject = (project: KpProject): string => JSON.stringify(projectSchema.parse(project));

export type IconName = z.infer<typeof iconNameSchema>;
export type FontId = z.infer<typeof fontIdSchema>;
export type TextAlign = z.infer<typeof textAlignSchema>;
export type VerticalAlign = z.infer<typeof verticalAlignSchema>;
export type ShapeKind = z.infer<typeof shapeKindSchema>;
export type KpLayer = z.infer<typeof layerSchema>;
export type KpTableStyle = z.infer<typeof tableStyleSchema>;
export type KpTableCell = z.infer<typeof tableCellSchema>;
export type KpTableRow = z.infer<typeof tableRowSchema>;
export type KpAsset = z.infer<typeof assetSchema>;
export type KpTextElement = z.infer<typeof textElementSchema>;
export type KpTextFieldElement = z.infer<typeof textFieldElementSchema>;
export type KpSelectOption = z.infer<typeof selectOptionSchema>;
export type KpSelectFieldElement = z.infer<typeof selectFieldElementSchema>;
export type KpImageElement = z.infer<typeof imageElementSchema>;
export type KpShapeElement = z.infer<typeof shapeElementSchema>;
export type KpTableElement = z.infer<typeof tableSchema>;
export type KpElement = z.infer<typeof elementSchema>;
export type KpPage = z.infer<typeof pageSchema>;
export type KpProject = z.infer<typeof projectSchema>;
export type KpRect = z.infer<typeof rectSchema>;
export type KpPageBackground = z.infer<typeof pageSchema.shape.background>;
