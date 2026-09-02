import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  calculateTableHeightMm,
  estimateMaxRowsOnPage,
  type KpElement,
  type KpProject,
  type KpRect,
  type KpTableElement,
  mmToPx,
  PAGE_MARGIN_MM,
  pxToMm,
  type RenderMode
} from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { ImageElementRenderer } from './renderers/ImageElementRenderer';
import { SelectFieldElementRenderer } from './renderers/SelectFieldElementRenderer';
import { TableElementRenderer } from './renderers/TableElementRenderer';
import { TextElementRenderer } from './renderers/TextElementRenderer';
import { TextFieldElementRenderer } from './renderers/TextFieldElementRenderer';

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
  const firstChunkLimit = Math.max(1, estimateMaxRowsOnPage(page.heightMm, table.rect.y, table.showPageHeader, table.style.rowHeight));
  const continuationStartY = Math.max(PAGE_MARGIN_MM, page.flowStartYmm);
  const continuationLimit = Math.max(1, estimateMaxRowsOnPage(page.heightMm, continuationStartY, table.showPageHeader, table.style.rowHeight));
  const chunks: KpTableElement[] = [];
  const repeatedHeader = table.firstRowHeader ? table.rows[0] : undefined;

  for (let offset = 0; offset < table.rows.length;) {
    const limit = offset === 0 ? firstChunkLimit : continuationLimit;
    const isContinuationWithHeader = offset > 0 && Boolean(repeatedHeader);
    const contentLimit = isContinuationWithHeader ? Math.max(1, limit - 1) : limit;
    const contentRows = table.rows.slice(offset, offset + contentLimit);
    const chunkRows = isContinuationWithHeader && repeatedHeader ? [repeatedHeader, ...contentRows] : contentRows;
    if (!chunkRows.length) break;

    chunks.push({
      ...table,
      rect: {
        ...table.rect,
        y: offset === 0 ? table.rect.y : continuationStartY,
        height: calculateTableHeightMm(table.columns.length, chunkRows.length, table.showPageHeader, table.style.rowHeight)
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
    updateTextField,
    updateSelectField,
    addTableRow,
    addTableColumn,
    deleteTableRow,
    deleteTableColumn,
    updateTableCell
  } = useEditorStore();
  const pageRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<ActiveInteraction | null>(null);
  const [draftRects, setDraftRects] = useState<Record<string, KpRect>>({});
  const draftRectsRef = useRef<Record<string, KpRect>>({});
  const paginatedPages = useMemo(() => buildPaginatedPages(project), [project]);
  const assetsById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const layersById = useMemo(() => new Map(project.layers.map((layer) => [layer.id, layer])), [project.layers]);

  useEffect(() => {
    if (renderMode === 'edit') return;
    dragRef.current = null;
    draftRectsRef.current = {};
    setDraftRects({});
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
      const nextRect: KpRect = {
        ...drag.rect,
        x: drag.mode === 'move' ? drag.rect.x + dxMm : drag.rect.x,
        y: drag.mode === 'move' ? drag.rect.y + dyMm : drag.rect.y,
        width: drag.mode === 'resize' ? drag.rect.width + dxMm : drag.rect.width,
        height: drag.mode === 'resize' ? drag.rect.height + dyMm : drag.rect.height
      };
      const key = `${drag.pageId}:${drag.elementId}`;
      draftRectsRef.current[key] = nextRect;
      setDraftRects((current) => ({ ...current, [key]: nextRect }));
    };

    const onUp = (): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const key = `${drag.pageId}:${drag.elementId}`;
      const finalRect = draftRectsRef.current[key];
      if (finalRect) updateElementRect(drag.pageId, drag.elementId, finalRect);
      dragRef.current = null;
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
  }, [updateElementRect, zoom]);

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
              className="page"
              style={{ width: `${mmToPx(page.widthMm, 96, zoom)}px`, height: `${mmToPx(page.heightMm, 96, zoom)}px` }}
            >
              {page.background?.type === 'color' ? <div className="page-bg" style={{ backgroundColor: page.background.value }} /> : null}
              {page.background?.type === 'image' ? <img className="page-bg-image" alt="фон" src={page.background.value} /> : null}
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
                  return <ImageElementRenderer key={element.id} asset={assetsById.get(element.assetId)} element={element} mode={elementMode} rect={rect} scale={scale} selected={isSelected} onSelect={onSelect} onMoveStart={onMoveStart} onResizeStart={onResizeStart} />;
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
                    onMoveStart={onMoveStart}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {renderMode === 'edit' ? <p className="hint">Выберите элемент, чтобы переместить его, изменить размер или настроить свойства.</p> : null}
    </div>
  );
};
