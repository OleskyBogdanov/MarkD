import type { KpRect } from '@/renderer/domain/model';

export type SnapInteractionMode = 'move' | 'resize';

export type PageSnapGuides = {
  vertical?: number;
  horizontal?: number;
};

type PageBounds = {
  widthMm: number;
  heightMm: number;
};

type SnapCandidate = {
  distance: number;
  guide: number;
  value: number;
};

const closestAxisCandidate = (
  sourcePoints: readonly number[],
  targetGuides: readonly number[],
  currentValue: number,
  thresholdMm: number,
  minimumValue?: number
): SnapCandidate | undefined => {
  let closest: SnapCandidate | undefined;

  for (const guide of targetGuides) {
    for (const sourcePoint of sourcePoints) {
      const distance = Math.abs(sourcePoint - guide);
      const value = currentValue + guide - sourcePoint;
      const validValue = minimumValue === undefined || value > minimumValue;
      if (distance <= thresholdMm && validValue && (!closest || distance < closest.distance)) {
        closest = { distance, guide, value };
      }
    }
  }

  return closest;
};

const rectHorizontalGuides = (rect: KpRect): [number, number, number] =>
  [rect.x, rect.x + rect.width / 2, rect.x + rect.width];

const rectVerticalGuides = (rect: KpRect): [number, number, number] =>
  [rect.y, rect.y + rect.height / 2, rect.y + rect.height];

const collectTargetGuides = (
  page: PageBounds,
  targetRects: readonly KpRect[]
): { horizontal: number[]; vertical: number[] } => {
  const horizontal = [0, page.widthMm / 2, page.widthMm];
  const vertical = [0, page.heightMm / 2, page.heightMm];

  for (const targetRect of targetRects) {
    horizontal.push(...rectHorizontalGuides(targetRect));
    vertical.push(...rectVerticalGuides(targetRect));
  }

  return { horizontal, vertical };
};

export const snapRectToPage = (
  rect: KpRect,
  page: PageBounds,
  mode: SnapInteractionMode,
  thresholdMm: number,
  targetRects: readonly KpRect[] = []
): { rect: KpRect; guides: PageSnapGuides } => {
  const targetGuides = collectTargetGuides(page, targetRects);

  if (mode === 'resize') {
    const horizontal = closestAxisCandidate(
      [rect.x + rect.width],
      targetGuides.horizontal,
      rect.width,
      thresholdMm,
      0
    );
    const vertical = closestAxisCandidate(
      [rect.y + rect.height],
      targetGuides.vertical,
      rect.height,
      thresholdMm,
      0
    );

    return {
      rect: {
        ...rect,
        width: horizontal?.value ?? rect.width,
        height: vertical?.value ?? rect.height
      },
      guides: {
        ...(horizontal ? { vertical: horizontal.guide } : {}),
        ...(vertical ? { horizontal: vertical.guide } : {})
      }
    };
  }

  const horizontal = closestAxisCandidate(
    rectHorizontalGuides(rect),
    targetGuides.horizontal,
    rect.x,
    thresholdMm
  );
  const vertical = closestAxisCandidate(
    rectVerticalGuides(rect),
    targetGuides.vertical,
    rect.y,
    thresholdMm
  );

  return {
    rect: {
      ...rect,
      x: horizontal?.value ?? rect.x,
      y: vertical?.value ?? rect.y
    },
    guides: {
      ...(horizontal ? { vertical: horizontal.guide } : {}),
      ...(vertical ? { horizontal: vertical.guide } : {})
    }
  };
};
