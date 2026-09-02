import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  calculateTableRowsHeightMm,
  type KpElement,
  type KpProject,
  type KpRect,
  type KpTableElement,
  mmToPx,
  PAGE_MARGIN_MM,
  pxToMm,
  TABLE_HEADER_HEIGHT_MM,
  TABLE_ROW_HEIGHT_MM,
  type RenderMode
} from '@/renderer/domain/model';
import { resolveTableRowHeight } from '@/renderer/domain/tableStyle';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { ImageElementRenderer } from './renderers/ImageElementRenderer';
import { SelectFieldElementRenderer } from './renderers/SelectFieldElementRenderer';
import { ShapeElementRenderer } from './renderers/ShapeElementRenderer';
import { TableElementRenderer } from './renderers/TableElementRenderer';
import { TextElementRenderer } from './renderers/TextElementRenderer';
import { TextFieldElementRenderer } from './renderers/TextFieldElementRenderer';
import { snapRectToPage, type PageSnapGuides } from './snapToPage';

type InteractionMode = 'move' | 'resize';

type ActiveInteraction = {
  pageId: string;
  elementId: string;
  mode: InteractionMode;
  rect: KpRect;
  pointerX: number;
  pointerY: number;
};

type ProjectCanvasProps = {
  project: KpProject;
  zoom: number;
  renderMode: RenderMode;
};

const EDITOR_CONTROL_CLEARANCE_PX = 28;
const PAGE_SNAP_TOLERANCE_PX = 6;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') resolve(reader.result);
    else reject(new Error('Изображение не удалось прочитать'));
  }, { once: true });
  reader.addEventListener('error', () => reject(reader.error ?? new Error('Изображение не удалось прочитать')), { once: true });
  reader.readAsDataURL(file);
});

const imageFilesFromDrag = (event: ReactDragEvent<HTMLElement>): File[] =>
  Array.from(event.dataTransfer.files).filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type) && file.size <= MAX_IMAGE_BYTES);

type ActiveSnapGuides = PageSnapGuides & {
  pageId: string;
};

type RenderedElement = {
  element: KpElement;
  sourcePageId: string;
};

type RenderedPage = {
  id: string;
  sourcePageId: string;
  widthMm: number;
  heightMm: number;
  background: KpProject['pages'][number]['background'];
  flowStartYmm: number;
  elements: RenderedElement[];
};

const splitTableRowsForRender = (
  page: { heightMm: number; flowStartYmm: number },
  table: KpTableElement
): KpTableElement[] => {
  const continuationStartY = Math.max(PAGE_MARGIN_MM, page.flowStartYmm);
  const chunks: KpTableElement[] = [];
  const repeatedHeader = table.firstRowHeader ? table.rows[0] : undefined;
  const fixedHeightMm = (table.showPageHeader ? TABLE_HEADER_HEIGHT_MM : 0) + 4;
  const rowHeightMm = (row: KpTableElement['rows'][number]): number =>
    TABLE_ROW_HEIGHT_MM * (resolveTableRowHeight(table, row.id) / 34);

  for (let offset = 0; offset < table.rows.length;) {
    const chunkTop = offset === 0 ? table.rect.y : continuationStartY;
    const isContinuationWithHeader = offset > 0 && Boolean(repeatedHeader);
    const repeatedHeaderHeightMm = isContinuationWithHeader && repeatedHeader ? rowHeightMm(repeatedHeader) : 0;
    const availableRowsHeightMm = Math.max(0, page.heightMm - chunkTop - PAGE_MARGIN_MM - fixedHeightMm - repeatedHeaderHeightMm);
    const contentRows: KpTableElement['rows'] = [];
    let usedHeightMm = 0;
    for (let index = offset; index < table.rows.length; index += 1) {
      const nextRow = table.rows[index];
      const nextHeightMm = rowHeightMm(nextRow);
      if (contentRows.length > 0 && usedHeightMm + nextHeightMm > availableRowsHeightMm) break;
      contentRows.push(nextRow);
      usedHeightMm += nextHeightMm;
    }
    const chunkRows = isContinuationWithHeader && repeatedHeader ? [repeatedHeader, ...contentRows] : contentRows;
    if (!chunkRows.length) break;

    chunks.push({
      ...table,
      rect: {
        ...table.rect,
        y: chunkTop,
        height: calculateTableRowsHeightMm(chunkRows.map((row) => resolveTableRowHeight(table, row.id)), table.showPageHeader)
      },
      rows: chunkRows
    });
    offset += contentRows.length;
  }

  return chunks;
};

const buildPaginatedPages = (project: KpProject): RenderedPage[] => project.pages.flatMap((sourcePage) => {
  const firstPageElements: RenderedElement[] = [];
  const continuationPages: RenderedPage[] = [];
  const layersById = new Map(project.layers.map((layer) => [layer.id, layer]));
  const visibleElements = sourcePage.elements
    .filter((element) => layersById.get(element.layerId)?.visible)
    .sort((a, b) => {
      const layerOrder = (layersById.get(a.layerId)?.order ?? 0) - (layersById.get(b.layerId)?.order ?? 0);
      return layerOrder || a.zIndex - b.zIndex;
    })
    .map((element) => ({
      ...element,
      zIndex: ((layersById.get(element.layerId)?.order ?? 0) + 1) * 10_000 + element.zIndex
    } as KpElement));

  visibleElements.forEach((element) => {
    if (element.type !== 'table') {
      firstPageElements.push({ element, sourcePageId: sourcePage.id });
      return;
    }

    splitTableRowsForRender(sourcePage, element).forEach((chunk, chunkIndex) => {
      const renderedChunk: KpElement = { ...chunk, id: element.id };
      if (chunkIndex === 0) {
        firstPageElements.push({ element: renderedChunk, sourcePageId: sourcePage.id });
        return;
      }

      continuationPages.push({
        id: `${sourcePage.id}::table-${element.id}-${chunkIndex}`,
        sourcePageId: sourcePage.id,
        widthMm: sourcePage.widthMm,
        heightMm: sourcePage.heightMm,
        background: sourcePage.background,
        flowStartYmm: sourcePage.flowStartYmm,
        elements: [{ element: renderedChunk, sourcePageId: sourcePage.id }]
      });
    });
  });

  return [{
    id: sourcePage.id,
    sourcePageId: sourcePage.id,
    widthMm: sourcePage.widthMm,
    heightMm: sourcePage.heightMm,
    background: sourcePage.background,
    flowStartYmm: sourcePage.flowStartYmm,
    elements: firstPageElements
  }, ...continuationPages];
});

export const ProjectCanvas = ({ project, zoom, renderMode }: ProjectCanvasProps) => {
  const {
    selected,
    activeLayerId,
    select,
    updateElementRect,
    updateText,
    updateShape,
    updateTextField,
    updateSelectField,
    addTableRow,
    addTableColumn,
    deleteTableRow,
    deleteTableColumn,
    updateTableCell,
    resizeTableColumnBoundary,
    updateTableRowHeight,
    addAsset,
    addImage
  } = useEditorStore();
  const pageRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<ActiveInteraction | null>(null);
  const [draftRects, setDraftRects] = useState<Record<string, KpRect>>({});
  const draftRectsRef = useRef<Record<string, KpRect>>({});
  const [snapGuides, setSnapGuides] = useState<ActiveSnapGuides | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const [dropMessage, setDropMessage] = useState('');
  const paginatedPages = useMemo(() => buildPaginatedPages(project), [project]);
  const assetsById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const layersById = useMemo(() => new Map(project.layers.map((layer) => [layer.id, layer])), [project.layers]);

  useEffect(() => {
    if (renderMode === 'edit') return;
    dragRef.current = null;
    draftRectsRef.current = {};
    setDraftRects({});
    setSnapGuides(null);
  }, [renderMode]);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const pageElement = pageRefs.current.get(drag.pageId);
      if (!pageElement) return;
      const pageRect = pageElement.getBoundingClientRect();
      const dxMm = pxToMm(event.clientX - pageRect.left - drag.pointerX, 96, zoom);
      const dyMm = pxToMm(event.clientY - pageRect.top - drag.pointerY, 96, zoom);
      const sourcePage = project.pages.find((page) => page.id === drag.pageId);
      if (!sourcePage) return;
      const unsnappedRect: KpRect = {
        ...drag.rect,
        x: drag.mode === 'move' ? drag.rect.x + dxMm : drag.rect.x,
        y: drag.mode === 'move' ? drag.rect.y + dyMm : drag.rect.y,
        width: drag.mode === 'resize' ? drag.rect.width + dxMm : drag.rect.width,
        height: drag.mode === 'resize' ? drag.rect.height + dyMm : drag.rect.height
      };
      const alignmentTargets = sourcePage.elements
        .filter((element) => element.id !== drag.elementId && layersById.get(element.layerId)?.visible)
        .map((element) => draftRectsRef.current[`${sourcePage.id}:${element.id}`] ?? element.rect);
      const { rect: nextRect, guides } = snapRectToPage(
        unsnappedRect,
        sourcePage,
        drag.mode,
        pxToMm(PAGE_SNAP_TOLERANCE_PX, 96, zoom),
        alignmentTargets
      );
      const key = `${drag.pageId}:${drag.elementId}`;
      draftRectsRef.current[key] = nextRect;
      setDraftRects((current) => ({ ...current, [key]: nextRect }));
      setSnapGuides(
        guides.vertical === undefined && guides.horizontal === undefined
          ? null
          : { pageId: drag.pageId, ...guides }
      );
    };

    const onUp = (): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const key = `${drag.pageId}:${drag.elementId}`;
      const finalRect = draftRectsRef.current[key];
      if (finalRect) updateElementRect(drag.pageId, drag.elementId, finalRect);
      dragRef.current = null;
      setSnapGuides(null);
      delete draftRectsRef.current[key];
      setDraftRects((current) => {
        const copy = { ...current };
        delete copy[key];
        return copy;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [layersById, project.pages, updateElementRect, zoom]);

  const setPageRef = (pageId: string, element: HTMLDivElement | null): void => {
    if (element) pageRefs.current.set(pageId, element);
    else pageRefs.current.delete(pageId);
  };

  const resolveRect = (pageId: string, elementId: string, rect: KpRect): KpRect =>
    draftRects[`${pageId}:${elementId}`] ?? rect;

  const startInteraction = (
    mode: InteractionMode,
    pageId: string,
    elementId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ): void => {
    if (renderMode !== 'edit' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const page = project.pages.find((item) => item.id === pageId);
    const element = page?.elements.find((item) => item.id === elementId);
    const layer = element ? layersById.get(element.layerId) : undefined;
    const pageElement = pageRefs.current.get(pageId);
    if (!page || !element || !layer || layer.id !== activeLayerId || !layer.visible || layer.locked || !pageElement) return;
    const key = `${pageId}:${elementId}`;
    const startRect = draftRectsRef.current[key] ?? draftRects[key] ?? element.rect;
    const pageRect = pageElement.getBoundingClientRect();
    select({ type: 'element', elementId, pageId });
    dragRef.current = {
      pageId,
      elementId,
      mode,
      rect: startRect,
      pointerX: event.clientX - pageRect.left,
      pointerY: event.clientY - pageRect.top
    };
  };

  const handleImageDrop = async (event: ReactDragEvent<HTMLDivElement>, page: RenderedPage): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetPageId(null);
    const files = imageFilesFromDrag(event);
    if (!files.length) {
      setDropMessage('Поддерживаются изображения PNG, JPG, WebP и GIF размером до 12 МБ.');
      return;
    }

    const pageRect = event.currentTarget.getBoundingClientRect();
    const center = {
      x: pxToMm(event.clientX - pageRect.left, 96, zoom),
      y: pxToMm(event.clientY - pageRect.top, 96, zoom)
    };

    try {
      for (const [index, file] of files.entries()) {
        const assetId = `asset_${globalThis.crypto.randomUUID()}`;
        addAsset({ id: assetId, name: file.name || `Изображение ${index + 1}`, mimeType: file.type, dataUrl: await readFileAsDataUrl(file) });
        addImage(page.sourcePageId, assetId, { x: center.x + index * 6, y: center.y + index * 6 });
      }
      setDropMessage(files.length === 1 ? 'Изображение добавлено.' : `Добавлено изображений: ${files.length}.`);
    } catch {
      setDropMessage('Не удалось добавить изображение.');
    }
  };

  return (
    <div className="pages-list" data-render-mode={renderMode} style={{ '--print-scale': 1 / zoom, '--canvas-zoom': zoom } as CSSProperties}>
      {paginatedPages.map((page, pageIndex) => {
        const scale = mmToPx(1, 96, zoom);
        return (
          <section className="page-item" data-testid="editor-page" key={page.id}>
            {renderMode === 'edit' ? (
              <div className="page-meta" aria-hidden="true">
                <span>Лист {String(pageIndex + 1).padStart(2, '0')}</span>
                <span>{page.widthMm} × {page.heightMm} мм</span>
              </div>
            ) : null}
            <div
              ref={(node) => setPageRef(page.id, node)}
              className={`page ${dropTargetPageId === page.id ? 'page-drop-target' : ''}`}
              style={{ width: `${mmToPx(page.widthMm, 96, zoom)}px`, height: `${mmToPx(page.heightMm, 96, zoom)}px` }}
              onDragEnter={renderMode === 'edit' ? (event) => {
                if (Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) setDropTargetPageId(page.id);
              } : undefined}
              onDragOver={renderMode === 'edit' ? (event) => {
                if (!Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              } : undefined}
              onDragLeave={renderMode === 'edit' ? (event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTargetPageId(null);
              } : undefined}
              onDrop={renderMode === 'edit' ? (event) => { void handleImageDrop(event, page); } : undefined}
            >
              {page.background?.type === 'color' ? <div className="page-bg" style={{ backgroundColor: page.background.value }} /> : null}
              {page.background?.type === 'image' ? <img className="page-bg-image" alt="фон" src={page.background.value} /> : null}
              {dropTargetPageId === page.id ? <div className="page-drop-overlay" role="status">Отпустите, чтобы добавить фото</div> : null}
              {snapGuides?.pageId === page.id && snapGuides.vertical !== undefined ? (
                <span
                  className="snap-guide snap-guide-vertical"
                  data-testid="snap-guide-vertical"
                  aria-hidden="true"
                  style={{ left: `${Math.min(Math.max(snapGuides.vertical * scale, 1), page.widthMm * scale - 1)}px` }}
                />
              ) : null}
              {snapGuides?.pageId === page.id && snapGuides.horizontal !== undefined ? (
                <span
                  className="snap-guide snap-guide-horizontal"
                  data-testid="snap-guide-horizontal"
                  aria-hidden="true"
                  style={{ top: `${Math.min(Math.max(snapGuides.horizontal * scale, 1), page.heightMm * scale - 1)}px` }}
                />
              ) : null}
              {page.elements.map(({ element, sourcePageId }) => {
                const layer = layersById.get(element.layerId);
                const interactive = renderMode === 'edit' && layer?.id === activeLayerId && layer.visible && !layer.locked;
                const elementMode: RenderMode = renderMode === 'edit' && !interactive ? 'preview' : renderMode;
                const isSelected = interactive && selected.type === 'element' && selected.pageId === sourcePageId && selected.elementId === element.id;
                const rect = resolveRect(sourcePageId, element.id, element.rect);
                const onSelect = (): void => { if (interactive) select({ type: 'element', pageId: sourcePageId, elementId: element.id }); };
                const onMoveStart = (event: ReactPointerEvent<HTMLButtonElement>): void => startInteraction('move', sourcePageId, element.id, event);
                const onResizeStart = (event: ReactPointerEvent<HTMLButtonElement>): void => startInteraction('resize', sourcePageId, element.id, event);

                if (element.type === 'text') {
                  return <TextElementRenderer key={element.id} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} zoom={zoom} onSelect={onSelect} onChange={(value) => updateText(sourcePageId, element.id, value)} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
                }
                if (element.type === 'textField') {
                  return <TextFieldElementRenderer key={element.id} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} zoom={zoom} onSelect={onSelect} onValueChange={(value) => updateTextField(sourcePageId, element.id, { value })} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
                }
                if (element.type === 'selectField') {
                  return <SelectFieldElementRenderer key={element.id} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} zoom={zoom} onSelect={onSelect} onValueChange={(selectedOptionId) => updateSelectField(sourcePageId, element.id, { selectedOptionId })} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
                }
                if (element.type === 'image') {
                  const fillsPage =
                    Math.abs(rect.x) < 0.01 &&
                    Math.abs(rect.y) < 0.01 &&
                    Math.abs(rect.width - page.widthMm) < 0.01 &&
                    Math.abs(rect.height - page.heightMm) < 0.01;
                  const controlsInside =
                    rect.x * scale < EDITOR_CONTROL_CLEARANCE_PX ||
                    rect.y * scale < EDITOR_CONTROL_CLEARANCE_PX ||
                    (page.widthMm - rect.x - rect.width) * scale < EDITOR_CONTROL_CLEARANCE_PX ||
                    (page.heightMm - rect.y - rect.height) * scale < EDITOR_CONTROL_CLEARANCE_PX;
                  return <ImageElementRenderer key={element.id} asset={assetsById.get(element.assetId)} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} controlsInside={controlsInside} fillsPage={fillsPage} onSelect={onSelect} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
                }
                if (element.type === 'shape') {
                  return <ShapeElementRenderer key={element.id} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} zoom={zoom} onSelect={onSelect} onTextChange={(text) => updateShape(sourcePageId, element.id, { text })} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
                }
                return (
                  <TableElementRenderer
                    key={`${page.id}:${element.id}`}
                    element={element}
                    mode={elementMode}
                    rect={rect}
                    scale={scale}
                    selected={isSelected}
                    zoom={zoom}
                    showPrimaryChrome={interactive && page.id === sourcePageId}
                    onSelect={onSelect}
                    onAddRow={() => addTableRow(sourcePageId, element.id)}
                    onAddColumn={() => addTableColumn(sourcePageId, element.id)}
                    onDeleteColumn={() => deleteTableColumn(sourcePageId, element.id, element.columns.at(-1) ?? '')}
                    onDeleteRow={(rowId) => deleteTableRow(sourcePageId, element.id, rowId)}
                    onCellChange={(rowId, columnId, value) => updateTableCell(sourcePageId, element.id, rowId, columnId, value)}
                    onColumnResize={(columnId, widthMm) => resizeTableColumnBoundary(sourcePageId, element.id, columnId, widthMm)}
                    onRowResize={(rowId, heightPx) => updateTableRowHeight(sourcePageId, element.id, rowId, heightPx)}
                    onMoveStart={onMoveStart}
                    onResizeStart={onResizeStart}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {renderMode === 'edit' ? <p className="hint">Выберите элемент, чтобы переместить его, изменить размер или настроить свойства.</p> : null}
      <p className="sr-only" role="status" aria-live="polite">{dropMessage}</p>
    </div>
  );
};
