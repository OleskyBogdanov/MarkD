import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  schemaVersion,
  DEFAULT_LAYER_ID,
  A4_SIZE_MM,
  KpProject,
  KpPage,
  KpAsset,
  KpRect,
  KpBackground,
  KpTextElement,
  KpTextFieldElement,
  KpSelectFieldElement,
  KpElement,
  KpLayer,
  KpTableElement,
  KpTableStyle,
  TextAlign,
  PAGE_MARGIN_MM,
  MIN_ELEMENT_MM_SIZE,
  clamp,
  calculateTableHeightMm,
  projectSchema
} from '@/renderer/domain/model';

const HISTORY_LIMIT = 100;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const clampMm = (value: number, min: number, max: number): number => clamp(value, min, max);
const clampText = (text: string): string => text.slice(0, 20_000).replace(/\r/g, '');

type MutationResult = boolean | void;

export type KpSelection =
  | { type: 'none' }
  | { type: 'element'; elementId: string; pageId: string };

type TextFieldUpdate = Partial<Pick<KpTextFieldElement, 'label' | 'showLabel' | 'value' | 'placeholder' | 'showPlaceholder' | 'iconName' | 'textAlign'>> & {
  style?: Partial<KpTextFieldElement['style']>;
};

type SelectFieldUpdate = Partial<Pick<KpSelectFieldElement, 'label' | 'placeholder' | 'selectedOptionId'>> & {
  style?: Partial<KpSelectFieldElement['style']>;
};

export type EditorState = {
  project: KpProject;
  selected: KpSelection;
  isDirty: boolean;
  undoStack: KpProject[];
  redoStack: KpProject[];
  zoom: number;
  activeLayerId: string;

  setProject: (project: KpProject) => void;
  resetProject: () => void;
  addPage: () => void;
  duplicatePage: (pageId: string) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  addText: (pageId: string) => void;
  addTextField: (pageId: string) => void;
  addSelectField: (pageId: string) => void;
  addTable: (pageId: string) => void;
  addImage: (pageId: string, assetId: string) => void;
  addAsset: (asset: KpAsset) => void;
  select: (selection: KpSelection) => void;
  updateElementRect: (pageId: string, elementId: string, rect: KpRect) => void;
  updateText: (pageId: string, elementId: string, text: string) => void;
  updateTextStyle: (pageId: string, elementId: string, style: Partial<KpTextElement['style']>) => void;
  updateTextField: (pageId: string, elementId: string, patch: TextFieldUpdate) => void;
  updateSelectField: (pageId: string, elementId: string, patch: SelectFieldUpdate) => void;
  addSelectOption: (pageId: string, elementId: string) => void;
  updateSelectOption: (pageId: string, elementId: string, optionId: string, label: string) => void;
  deleteSelectOption: (pageId: string, elementId: string, optionId: string) => void;
  updateProjectTitle: (title: string) => void;
  addTableRow: (pageId: string, tableId: string) => void;
  addTableColumn: (pageId: string, tableId: string) => void;
  deleteTableRow: (pageId: string, tableId: string, rowId: string) => void;
  deleteTableColumn: (pageId: string, tableId: string, columnId: string) => void;
  updateTableHeader: (pageId: string, tableId: string, header: string) => void;
  updateTableSettings: (pageId: string, tableId: string, settings: Partial<Pick<KpTableElement, 'showPageHeader' | 'firstRowHeader'>>) => void;
  updateTableCell: (pageId: string, tableId: string, rowId: string, columnId: string, text: string) => void;
  updateTableStyle: (pageId: string, tableId: string, style: Partial<Omit<KpTableStyle, 'columnAlign' | 'rowAlign'>>) => void;
  updateTableColumnAlign: (pageId: string, tableId: string, columnId: string, align: TextAlign | null) => void;
  updateTableRowAlign: (pageId: string, tableId: string, rowId: string, align: TextAlign | null) => void;
  updateTableColumnWidth: (pageId: string, tableId: string, columnId: string, widthMm: number) => void;
  moveTableColumn: (pageId: string, tableId: string, columnId: string, direction: -1 | 1) => void;
  moveTableRow: (pageId: string, tableId: string, rowId: string, direction: -1 | 1) => void;
  addLayer: () => void;
  renameLayer: (layerId: string, name: string) => void;
  deleteLayer: (layerId: string) => void;
  reorderLayer: (layerId: string, direction: -1 | 1) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  setLayerLocked: (layerId: string, locked: boolean) => void;
  setActiveLayer: (layerId: string) => void;
  moveElementToLayer: (pageId: string, elementId: string, layerId: string) => void;
  updatePageBackground: (pageId: string, background: KpBackground) => void;
  deleteElement: (pageId: string, elementId: string) => void;
  deleteSelected: () => void;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  setDirty: (isDirty: boolean) => void;
};

const makeDefaultTextElement = (page: KpPage, layerId: string) => {
  const textBottom = page.elements
    .filter((element) => element.type !== 'table')
    .reduce((bottom, element) => Math.max(bottom, element.rect.y + element.rect.height), PAGE_MARGIN_MM);
  const tableTop = page.elements
    .filter((element) => element.type === 'table')
    .reduce((top, element) => Math.min(top, element.rect.y), page.heightMm - PAGE_MARGIN_MM);
  const height = 26;
  const nextY = clampMm(textBottom + 8, PAGE_MARGIN_MM, Math.max(PAGE_MARGIN_MM, tableTop - height - 8));

  return {
  id: `el_${nanoid(12)}`,
  type: 'text' as const,
  rect: { x: 16, y: nextY, width: 178, height },
  text: 'Новый текст',
  style: {
    fontFamily: 'Avenir Next, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14,
    bold: false,
    italic: false,
    align: 'left',
    color: '#23241f'
  },
  layerId,
  zIndex: 0
  };
};

const makeDefaultPage = (): KpPage => ({
  id: `p_${nanoid(10)}`,
  widthMm: A4_SIZE_MM.width,
  heightMm: A4_SIZE_MM.height,
  background: null,
  elements: [],
  flowStartYmm: PAGE_MARGIN_MM
});

const defaultFieldStyle = {
  fontFamily: 'Avenir Next, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: 12,
  textColor: '#23241f',
  labelColor: '#5e6159',
  iconColor: '#1e5b49',
  backgroundColor: '#fffefa',
  borderColor: '#c9cac2',
  borderRadius: 6,
  backgroundTransparent: false,
  borderVisible: true
};

const nextElementY = (page: KpPage, height: number): number => {
  const contentBottom = page.elements
    .filter((element) => element.type !== 'table')
    .reduce((bottom, element) => Math.max(bottom, element.rect.y + element.rect.height), PAGE_MARGIN_MM);
  const tableTop = page.elements
    .filter((element) => element.type === 'table')
    .reduce((top, element) => Math.min(top, element.rect.y), page.heightMm - PAGE_MARGIN_MM);

  return clampMm(contentBottom + 8, PAGE_MARGIN_MM, Math.max(PAGE_MARGIN_MM, tableTop - height - 8));
};

const makeDefaultTextFieldElement = (page: KpPage, layerId: string): KpTextFieldElement => ({
  id: `field_${nanoid(10)}`,
  type: 'textField',
  rect: { x: 16, y: nextElementY(page, 22), width: 86, height: 22 },
  label: 'Контактное лицо',
  showLabel: true,
  value: '',
  placeholder: 'Введите значение',
  showPlaceholder: true,
  iconName: 'user',
  textAlign: 'left',
  style: { ...defaultFieldStyle },
  layerId,
  zIndex: page.elements.length
});

const makeDefaultSelectFieldElement = (page: KpPage, layerId: string): KpSelectFieldElement => ({
  id: `select_${nanoid(10)}`,
  type: 'selectField',
  rect: { x: 108, y: nextElementY(page, 22), width: 86, height: 22 },
  label: 'Тариф',
  placeholder: 'Выберите вариант',
  options: [
    { id: `option_${nanoid(8)}`, label: 'Стандарт' },
    { id: `option_${nanoid(8)}`, label: 'Премиум' }
  ],
  selectedOptionId: null,
  style: { ...defaultFieldStyle },
  layerId,
  zIndex: page.elements.length
});

const defaultTableStyle: KpTableStyle = {
  textColor: '#23241f',
  backgroundColor: '#fffefa',
  headerTextColor: '#ffffff',
  headerBackgroundColor: '#23241f',
  headerRowTextColor: '#23241f',
  headerRowBackgroundColor: '#eeeee8',
  headerRowBold: true,
  alternatingRows: false,
  alternateRowColor: '#f5f5f0',
  borderColor: '#b7b9b0',
  borderVisible: true,
  borderWidth: 1,
  borderStyle: 'solid',
  cellPadding: 7,
  rowHeight: 34,
  fontSize: 11,
  verticalAlign: 'middle',
  wrapText: true,
  align: 'left',
  columnAlign: {},
  rowAlign: {}
};

const makeDefaultTableElement = (y = 152, layerId = DEFAULT_LAYER_ID): KpTableElement => ({
  id: `table_${nanoid(10)}`,
  type: 'table' as const,
  rect: { x: 16, y, width: 178, height: calculateTableHeightMm(3, 1) },
  columns: [`col_${nanoid(8)}-1`, `col_${nanoid(8)}-2`, `col_${nanoid(8)}-3`],
  rows: [
    {
      id: `row_${nanoid(8)}`,
      cells: [
        { id: `cell_${nanoid(8)}_0`, text: 'Наименование', widthMm: 70 },
        { id: `cell_${nanoid(8)}_1`, text: 'Кол-во', widthMm: 35 },
        { id: `cell_${nanoid(8)}_2`, text: 'Цена', widthMm: 35 }
      ]
    }
  ],
  pageHeader: 'Позиции',
  showPageHeader: true,
  firstRowHeader: true,
  style: clone(defaultTableStyle),
  layerId,
  zIndex: 0
});

const makeDefaultProject = (): KpProject => {
  const now = new Date().toISOString();
  return ({
  schemaVersion,
  metadata: {
    id: `project_${nanoid(16)}`,
    title: 'Новый КП',
    createdBy: 'MarkD',
    createdAt: now,
    updatedAt: now
  },
  orientation: 'portrait',
  layers: [{ id: DEFAULT_LAYER_ID, name: 'Основной', order: 0, visible: true, locked: false }],
  pages: [
    {
      ...makeDefaultPage(),
      elements: [
        {
          id: `el_${nanoid(10)}`,
          type: 'text' as const,
          rect: { x: 16, y: 12, width: 180, height: 20 },
          text: 'Коммерческое предложение',
          style: {
            fontFamily: 'Avenir Next, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 20,
            bold: true,
            italic: false,
            align: 'left',
            color: '#23241f'
          },
          layerId: DEFAULT_LAYER_ID,
          zIndex: 0
        },
        makeDefaultTableElement()
      ]
    }
  ],
  assets: [],
  styles: {}
  });
};

const layerIsEditable = (state: Pick<EditorState, 'project' | 'activeLayerId'>, layerId: string): boolean => {
  const layer = state.project.layers.find((candidate) => candidate.id === layerId);
  return Boolean(layer && layer.id === state.activeLayerId && layer.visible && !layer.locked);
};

const elementIsEditable = (state: Pick<EditorState, 'project' | 'activeLayerId'>, element: KpElement): boolean =>
  layerIsEditable(state, element.layerId);

const findTable = (page: KpPage | undefined, tableId: string): KpTableElement | undefined =>
  page?.elements.find((candidate): candidate is KpTableElement => candidate.type === 'table' && candidate.id === tableId);

const calculateTableElementHeightMm = (table: KpTableElement): number =>
  calculateTableHeightMm(table.columns.length, table.rows.length, table.showPageHeader, table.style.rowHeight);

const preferredActiveLayer = (layers: KpLayer[]): string =>
  layers.find((layer) => layer.visible && !layer.locked)?.id ?? layers[0]?.id ?? DEFAULT_LAYER_ID;

const normalizeRect = (rect: KpRect, bounds: KpPage): KpRect => {
  const maxWidth = Math.max(bounds.widthMm - 2 * MIN_ELEMENT_MM_SIZE, MIN_ELEMENT_MM_SIZE);
  const maxHeight = Math.max(bounds.heightMm - 2 * MIN_ELEMENT_MM_SIZE, MIN_ELEMENT_MM_SIZE);

  return {
    x: clampMm(rect.x, 0, Math.max(0, bounds.widthMm - MIN_ELEMENT_MM_SIZE)),
    y: clampMm(rect.y, 0, Math.max(0, bounds.heightMm - MIN_ELEMENT_MM_SIZE)),
    width: clampMm(rect.width, MIN_ELEMENT_MM_SIZE, maxWidth),
    height: clampMm(rect.height, MIN_ELEMENT_MM_SIZE, maxHeight)
  };
};

const applyHistory = (state: EditorState, mutate: (draft: EditorState) => MutationResult): EditorState => {
  const previousProject = clone(state.project);
  const draft = clone(state);
  const changed = mutate(draft);

  if (!changed) {
    return state;
  }

  draft.project = projectSchema.parse(draft.project);

  return {
    ...draft,
    undoStack: [...state.undoStack, previousProject].slice(-HISTORY_LIMIT),
    redoStack: [],
    isDirty: true
  };
};

export const useEditorStore = create<EditorState>((set) => ({
  project: makeDefaultProject(),
  selected: { type: 'none' },
  isDirty: false,
  undoStack: [],
  redoStack: [],
  zoom: 1,
  activeLayerId: DEFAULT_LAYER_ID,

  setProject(project) {
    const parsed = projectSchema.parse(project);
    set({
      project: parsed,
      selected: { type: 'none' },
      isDirty: false,
      undoStack: [],
      redoStack: [],
      activeLayerId: preferredActiveLayer(parsed.layers)
    });
  },

  resetProject() {
    const project = makeDefaultProject();
    set({
      project,
      selected: { type: 'none' },
      isDirty: false,
      undoStack: [],
      redoStack: [],
      activeLayerId: preferredActiveLayer(project.layers)
    });
  },

  addPage() {
    set((state) =>
      applyHistory(state, (draft) => {
        draft.project.pages.push(makeDefaultPage());
        return true;
      })
    );
  },

  duplicatePage(pageId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const index = draft.project.pages.findIndex((page) => page.id === pageId);
        if (index < 0) return;

        const original = draft.project.pages[index];
        const copy: KpPage = {
          ...clone(original),
          id: `p_${nanoid(10)}`,
          elements: original.elements.map((element) => ({
            ...(clone(element) as KpElement),
            id: `${element.id}_${nanoid(6)}`
          }))
        };

        draft.project.pages.splice(index + 1, 0, copy);
        return true;
      })
    );
  },

  movePage(fromIndex, toIndex) {
    set((state) =>
      applyHistory(state, (draft) => {
        const count = draft.project.pages.length;
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= count ||
          toIndex >= count ||
          fromIndex === toIndex
        ) {
          return;
        }

        const [page] = draft.project.pages.splice(fromIndex, 1);
        draft.project.pages.splice(toIndex, 0, page);
        return true;
      })
    );
  },

  addText(pageId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        if (!layerIsEditable(draft, draft.activeLayerId)) return;
        const element = makeDefaultTextElement(page, draft.activeLayerId) as KpElement;
        page.elements.push(element);
        draft.selected = { type: 'element', pageId, elementId: element.id };
        return true;
      })
    );
  },

  addTextField(pageId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        if (!layerIsEditable(draft, draft.activeLayerId)) return;
        const element = makeDefaultTextFieldElement(page, draft.activeLayerId);
        page.elements.push(element);
        draft.selected = { type: 'element', pageId, elementId: element.id };
        return true;
      })
    );
  },

  addSelectField(pageId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        if (!layerIsEditable(draft, draft.activeLayerId)) return;
        const element = makeDefaultSelectFieldElement(page, draft.activeLayerId);
        page.elements.push(element);
        draft.selected = { type: 'element', pageId, elementId: element.id };
        return true;
      })
    );
  },

  addTable(pageId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        if (!layerIsEditable(draft, draft.activeLayerId)) return;
        const lastBottom = page.elements.reduce(
          (bottom, element) => Math.max(bottom, element.rect.y + element.rect.height),
          PAGE_MARGIN_MM
        );
        const height = calculateTableHeightMm(3, 1);
        const y = clampMm(lastBottom + 8, PAGE_MARGIN_MM, page.heightMm - PAGE_MARGIN_MM - height);
        const element = makeDefaultTableElement(y, draft.activeLayerId);
        page.elements.push(element);
        draft.selected = { type: 'element', pageId, elementId: element.id };
        return true;
      })
    );
  },

  addAsset(asset) {
    set((state) =>
      applyHistory(state, (draft) => {
        if (draft.project.assets.some((item) => item.id === asset.id)) return;
        draft.project.assets.push(asset);
        return true;
      })
    );
  },

  addImage(pageId, assetId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        if (!layerIsEditable(draft, draft.activeLayerId)) return;
        const width = 76;
        const height = 38;
        const contentBottom = page.elements
          .filter((element) => element.type !== 'table')
          .reduce((bottom, element) => Math.max(bottom, element.rect.y + element.rect.height), PAGE_MARGIN_MM);
        const tableTop = page.elements
          .filter((element) => element.type === 'table')
          .reduce((top, element) => Math.min(top, element.rect.y), page.heightMm - PAGE_MARGIN_MM);
        const y = clampMm(contentBottom + 8, PAGE_MARGIN_MM, Math.max(PAGE_MARGIN_MM, tableTop - height - 8));

        page.elements.push({
          id: `el_${nanoid(10)}`,
          type: 'image',
          rect: {
            x: 16,
            y,
            width,
            height
          },
          assetId,
          layerId: draft.activeLayerId,
          zIndex: page.elements.length
        });
        return true;
      })
    );
  },

  select(selection) {
    set((state) => {
      if (selection.type === 'none') return { selected: selection };
      const page = state.project.pages.find((candidate) => candidate.id === selection.pageId);
      const element = page?.elements.find((candidate) => candidate.id === selection.elementId);
      return { selected: element && elementIsEditable(state, element) ? selection : { type: 'none' as const } };
    });
  },

  updateElementRect(pageId, elementId, rect) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!page || !element || !elementIsEditable(draft, element)) return;

        const nextRect = normalizeRect(rect, page);
        if (element.type === 'table') {
          nextRect.height = calculateTableElementHeightMm(element);
        }
        if (
          element.rect.x === nextRect.x &&
          element.rect.y === nextRect.y &&
          element.rect.width === nextRect.width &&
          element.rect.height === nextRect.height
        ) {
          return;
        }

        element.rect = nextRect;
        return true;
      })
    );
  },

  updateText(pageId, elementId, text) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'text' || !elementIsEditable(draft, element)) return;

        const nextText = clampText(text);
        if ((element as KpTextElement).text === nextText) {
          return;
        }

        (element as KpTextElement).text = nextText;
        return true;
      })
    );
  },

  updateTextStyle(pageId, elementId, style) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'text' || !elementIsEditable(draft, element)) return;

        const nextStyle = {
          ...element.style,
          ...style,
          fontSize: clampMm(style.fontSize ?? element.style.fontSize, 8, 72)
        };
        if (JSON.stringify(nextStyle) === JSON.stringify(element.style)) return;

        element.style = nextStyle;
        return true;
      })
    );
  },

  updateTextField(pageId, elementId, patch) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'textField' || !elementIsEditable(draft, element)) return;

        const next = {
          ...element,
          ...patch,
          label: patch.label === undefined ? element.label : clampText(patch.label).slice(0, 120),
          value: patch.value === undefined ? element.value : clampText(patch.value),
          placeholder: patch.placeholder === undefined ? element.placeholder : clampText(patch.placeholder).slice(0, 240),
          style: patch.style ? { ...element.style, ...patch.style } : element.style
        };
        if (JSON.stringify(next) === JSON.stringify(element)) return;
        Object.assign(element, next);
        return true;
      })
    );
  },

  updateSelectField(pageId, elementId, patch) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'selectField' || !elementIsEditable(draft, element)) return;

        const requestedOption = patch.selectedOptionId;
        const selectedOptionId = requestedOption === undefined
          ? element.selectedOptionId
          : requestedOption === null || element.options.some((option) => option.id === requestedOption)
            ? requestedOption
            : element.selectedOptionId;
        const next = {
          ...element,
          ...patch,
          label: patch.label === undefined ? element.label : clampText(patch.label).slice(0, 120),
          placeholder: patch.placeholder === undefined ? element.placeholder : clampText(patch.placeholder).slice(0, 240),
          selectedOptionId,
          style: patch.style ? { ...element.style, ...patch.style } : element.style
        };
        if (JSON.stringify(next) === JSON.stringify(element)) return;
        Object.assign(element, next);
        return true;
      })
    );
  },

  addSelectOption(pageId, elementId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'selectField' || !elementIsEditable(draft, element)) return;

        element.options.push({ id: `option_${nanoid(10)}`, label: `Вариант ${element.options.length + 1}` });
        return true;
      })
    );
  },

  updateSelectOption(pageId, elementId, optionId, label) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'selectField' || !elementIsEditable(draft, element)) return;
        const option = element.options.find((item) => item.id === optionId);
        if (!option) return;

        const nextLabel = clampText(label).slice(0, 500);
        if (nextLabel === option.label) return;
        option.label = nextLabel;
        return true;
      })
    );
  },

  deleteSelectOption(pageId, elementId, optionId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!element || element.type !== 'selectField' || !elementIsEditable(draft, element) || element.options.length <= 1) return;

        const nextOptions = element.options.filter((option) => option.id !== optionId);
        if (nextOptions.length === element.options.length) return;
        element.options = nextOptions;
        if (element.selectedOptionId === optionId) element.selectedOptionId = null;
        return true;
      })
    );
  },

  updateProjectTitle(title) {
    set((state) =>
      applyHistory(state, (draft) => {
        const nextTitle = clampText(title).slice(0, 120).trimStart();
        if (!nextTitle || nextTitle === draft.project.metadata.title) return;
        draft.project.metadata.title = nextTitle;
        return true;
      })
    );
  },

  addTableRow(pageId, tableId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;

        const referenceWidths = table.rows[0]?.cells.map((cell) => cell.widthMm) ?? [];
        table.rows.push({
          id: `row_${nanoid(8)}`,
          cells: table.columns.map((_, index) => ({
            id: `cell_${nanoid(8)}_${table.rows.length}_${index}`,
            text: '',
            widthMm: referenceWidths[index] ?? 35
          }))
        });
        table.rect.height = calculateTableElementHeightMm(table);
        return true;
      })
    );
  },

  addTableColumn(pageId, tableId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;

        const columnId = `col_${nanoid(10)}`;
        table.columns.push(columnId);
        table.rows.forEach((row) => {
          row.cells.push({
            id: `cell_${row.id}_${columnId}`,
            text: '',
            widthMm: 35
          });
        });
        return true;
      })
    );
  },

  deleteTableRow(pageId, tableId, rowId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table) || table.rows.length <= 1) return;

        const before = table.rows.length;
        table.rows = table.rows.filter((row) => row.id !== rowId);
        if (table.rows.length === before) return;
        delete table.style.rowAlign[rowId];

        if (!table.rows.length) {
          table.rows.push({
            id: `row_${nanoid(8)}`,
            cells: table.columns.map((_, columnIndex) => ({
              id: `cell_${nanoid(8)}_${columnIndex}`,
              text: '',
              widthMm: 35
            }))
          });
        }

        table.rect.height = calculateTableElementHeightMm(table);

        return true;
      })
    );
  },

  deleteTableColumn(pageId, tableId, columnId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table) || table.columns.length <= 1) return;

        const columnIndex = table.columns.findIndex((item) => item === columnId);
        if (columnIndex < 0) return;

        table.columns.splice(columnIndex, 1);
        delete table.style.columnAlign[columnId];
        table.rows.forEach((row) => {
          row.cells.splice(columnIndex, 1);
        });
        return true;
      })
    );
  },

  updateTableHeader(pageId, tableId, header) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;

        const normalized = header.slice(0, 80);
        if (table.pageHeader === normalized) return;

        table.pageHeader = normalized;
        return true;
      })
    );
  },

  updateTableSettings(pageId, tableId, settings) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;
        const next = { ...table, ...settings };
        if (table.showPageHeader === next.showPageHeader && table.firstRowHeader === next.firstRowHeader) return;
        table.showPageHeader = next.showPageHeader;
        table.firstRowHeader = next.firstRowHeader;
        table.rect.height = calculateTableElementHeightMm(table);
        return true;
      })
    );
  },

  updateTableCell(pageId, tableId, rowId, columnId, text) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;

        const row = table.rows.find((candidate) => candidate.id === rowId);
        if (!row) return;

        const index = table.columns.findIndex((value) => value === columnId);
        if (index < 0 || index >= row.cells.length) return;

        const nextValue = clampText(text);
        if (row.cells[index].text === nextValue) return;

        row.cells[index].text = nextValue;
        return true;
      })
    );
  },

  updateTableStyle(pageId, tableId, style) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;
        const next = { ...table.style, ...style };
        if (JSON.stringify(next) === JSON.stringify(table.style)) return;
        table.style = next;
        table.rect.height = calculateTableElementHeightMm(table);
        return true;
      })
    );
  },

  updateTableColumnAlign(pageId, tableId, columnId, align) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table) || !table.columns.includes(columnId)) return;
        const current = table.style.columnAlign[columnId];
        if ((align === null && current === undefined) || current === align) return;
        if (align === null) delete table.style.columnAlign[columnId];
        else table.style.columnAlign[columnId] = align;
        return true;
      })
    );
  },

  updateTableRowAlign(pageId, tableId, rowId, align) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table) || !table.rows.some((row) => row.id === rowId)) return;
        const current = table.style.rowAlign[rowId];
        if ((align === null && current === undefined) || current === align) return;
        if (align === null) delete table.style.rowAlign[rowId];
        else table.style.rowAlign[rowId] = align;
        return true;
      })
    );
  },

  updateTableColumnWidth(pageId, tableId, columnId, widthMm) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;
        const columnIndex = table.columns.indexOf(columnId);
        if (columnIndex < 0) return;
        const nextWidth = clampMm(widthMm, 10, 120);
        if (table.rows.every((row) => row.cells[columnIndex]?.widthMm === nextWidth)) return;
        table.rows.forEach((row) => {
          if (row.cells[columnIndex]) row.cells[columnIndex].widthMm = nextWidth;
        });
        return true;
      })
    );
  },

  moveTableColumn(pageId, tableId, columnId, direction) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;
        const from = table.columns.indexOf(columnId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= table.columns.length) return;
        [table.columns[from], table.columns[to]] = [table.columns[to], table.columns[from]];
        table.rows.forEach((row) => {
          [row.cells[from], row.cells[to]] = [row.cells[to], row.cells[from]];
        });
        return true;
      })
    );
  },

  moveTableRow(pageId, tableId, rowId, direction) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        const table = findTable(page, tableId);
        if (!table || !elementIsEditable(draft, table)) return;
        const from = table.rows.findIndex((row) => row.id === rowId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= table.rows.length) return;
        [table.rows[from], table.rows[to]] = [table.rows[to], table.rows[from]];
        return true;
      })
    );
  },

  addLayer() {
    set((state) =>
      applyHistory(state, (draft) => {
        const layer: KpLayer = {
          id: `layer_${nanoid(10)}`,
          name: `Слой ${draft.project.layers.length + 1}`,
          order: draft.project.layers.length,
          visible: true,
          locked: false
        };
        draft.project.layers.push(layer);
        draft.activeLayerId = layer.id;
        draft.selected = { type: 'none' };
        return true;
      })
    );
  },

  renameLayer(layerId, name) {
    set((state) =>
      applyHistory(state, (draft) => {
        const layer = draft.project.layers.find((candidate) => candidate.id === layerId);
        const normalized = name.trim().slice(0, 80);
        if (!layer || !normalized || layer.name === normalized) return;
        layer.name = normalized;
        return true;
      })
    );
  },

  deleteLayer(layerId) {
    set((state) =>
      applyHistory(state, (draft) => {
        if (draft.project.layers.length <= 1) return;
        const index = draft.project.layers.findIndex((candidate) => candidate.id === layerId);
        if (index < 0) return;
        const target = draft.project.layers.find((candidate) => candidate.id !== layerId);
        if (!target) return;
        draft.project.pages.forEach((page) => {
          page.elements.forEach((element) => {
            if (element.layerId === layerId) element.layerId = target.id;
          });
        });
        draft.project.layers.splice(index, 1);
        draft.project.layers
          .sort((a, b) => a.order - b.order)
          .forEach((layer, order) => { layer.order = order; });
        if (draft.activeLayerId === layerId) draft.activeLayerId = preferredActiveLayer(draft.project.layers);
        draft.selected = { type: 'none' };
        return true;
      })
    );
  },

  reorderLayer(layerId, direction) {
    set((state) =>
      applyHistory(state, (draft) => {
        const ordered = [...draft.project.layers].sort((a, b) => a.order - b.order);
        const index = ordered.findIndex((layer) => layer.id === layerId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
        [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
        ordered.forEach((layer, order) => { layer.order = order; });
        draft.project.layers = ordered;
        return true;
      })
    );
  },

  setLayerVisibility(layerId, visible) {
    set((state) =>
      applyHistory(state, (draft) => {
        const layer = draft.project.layers.find((candidate) => candidate.id === layerId);
        if (!layer || layer.visible === visible) return;
        layer.visible = visible;
        if (!visible && draft.activeLayerId === layerId) {
          draft.activeLayerId = preferredActiveLayer(draft.project.layers);
          draft.selected = { type: 'none' };
        }
        return true;
      })
    );
  },

  setLayerLocked(layerId, locked) {
    set((state) =>
      applyHistory(state, (draft) => {
        const layer = draft.project.layers.find((candidate) => candidate.id === layerId);
        if (!layer || layer.locked === locked) return;
        layer.locked = locked;
        if (locked && draft.activeLayerId === layerId) {
          draft.activeLayerId = preferredActiveLayer(draft.project.layers);
          draft.selected = { type: 'none' };
        }
        return true;
      })
    );
  },

  setActiveLayer(layerId) {
    set((state) => {
      const layer = state.project.layers.find((candidate) => candidate.id === layerId);
      if (!layer || !layer.visible || layer.locked || state.activeLayerId === layerId) return state;
      return { activeLayerId: layerId, selected: { type: 'none' as const } };
    });
  },

  moveElementToLayer(pageId, elementId, layerId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const target = draft.project.layers.find((candidate) => candidate.id === layerId);
        const page = draft.project.pages.find((candidate) => candidate.id === pageId);
        const element = page?.elements.find((candidate) => candidate.id === elementId);
        if (!target || !target.visible || target.locked || !element || !elementIsEditable(draft, element) || element.layerId === layerId) return;
        element.layerId = layerId;
        draft.activeLayerId = layerId;
        return true;
      })
    );
  },

  updatePageBackground(pageId, background) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        page.background = background;
        return true;
      })
    );
  },

  deleteElement(pageId, elementId) {
    set((state) =>
      applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === pageId);
        if (!page) return;

        const element = page.elements.find((candidate) => candidate.id === elementId);
        if (!element || !elementIsEditable(draft, element)) return;

        const before = page.elements.length;
        page.elements = page.elements.filter((element) => element.id !== elementId);
        if (before === page.elements.length) return;

        if (draft.selected.type === 'element' && draft.selected.elementId === elementId) {
          draft.selected = { type: 'none' };
        }

        return true;
      })
    );
  },

  deleteSelected() {
    set((state) => {
      if (state.selected.type === 'none') {
        return state;
      }
      const selection = state.selected;

      return applyHistory(state, (draft) => {
        const page = draft.project.pages.find((item) => item.id === selection.pageId);
        if (!page) {
          draft.selected = { type: 'none' };
          return true;
        }

        const selectedElement = page.elements.find((element) => element.id === selection.elementId);
        if (!selectedElement || !elementIsEditable(draft, selectedElement)) {
          draft.selected = { type: 'none' };
          return;
        }

        const before = page.elements.length;
        page.elements = page.elements.filter((element) => element.id !== selection.elementId);
        if (before === page.elements.length) {
          return;
        }

        draft.selected = { type: 'none' };
        return true;
      });
    });
  },

  setZoom(zoom) {
    set({ zoom: clampMm(zoom, 0.5, 2) });
  },

  undo() {
    set((state) => {
      if (!state.undoStack.length) {
        return state;
      }

      const previousProject = state.undoStack[state.undoStack.length - 1];
      const nextRedo = [...state.redoStack, clone(state.project)].slice(-HISTORY_LIMIT);

      return {
        ...state,
        project: previousProject,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: nextRedo,
        selected: { type: 'none' },
        activeLayerId: previousProject.layers.some((layer) => layer.id === state.activeLayerId && layer.visible && !layer.locked)
          ? state.activeLayerId
          : preferredActiveLayer(previousProject.layers),
        isDirty: true
      };
    });
  },

  redo() {
    set((state) => {
      if (!state.redoStack.length) {
        return state;
      }

      const next = state.redoStack[state.redoStack.length - 1];
      const nextUndo = [...state.undoStack, clone(state.project)].slice(-HISTORY_LIMIT);

      return {
        ...state,
        project: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: nextUndo,
        selected: { type: 'none' },
        activeLayerId: next.layers.some((layer) => layer.id === state.activeLayerId && layer.visible && !layer.locked)
          ? state.activeLayerId
          : preferredActiveLayer(next.layers),
        isDirty: true
      };
    });
  },

  setDirty(isDirty) {
    set({ isDirty });
  }
}));
