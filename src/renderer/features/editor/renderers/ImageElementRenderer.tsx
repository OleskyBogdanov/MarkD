import type { PointerEvent as ReactPointerEvent } from 'react';
import type { KpAsset, KpImageElement, KpRect, RenderMode } from '@/renderer/domain/model';
import { ElementFrame } from './ElementFrame';
import './image-element.css';

type ImageElementRendererProps = {
  asset?: KpAsset;
  element: KpImageElement;
  mode: RenderMode;
  rect: KpRect;
  scale: number;
  selected: boolean;
  controlsInside: boolean;
  fillsPage: boolean;
  onSelect: () => void;
  onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export const ImageElementRenderer = ({
  asset,
  element,
  mode,
  rect,
  scale,
  selected,
  controlsInside,
  fillsPage,
  onSelect,
  onMoveStart,
  onResizeStart
}: ImageElementRendererProps) => (
  <ElementFrame
    className={`image-element${fillsPage ? ' image-element-full-page' : ''}`}
    mode={mode}
    rect={rect}
    scale={scale}
    selected={selected}
    controlsInside={controlsInside}
    testId="image-element"
    zIndex={element.zIndex}
    moveLabel="Переместить изображение"
    resizeLabel="Изменить размер изображения"
    moveTestId="image-drag-handle"
    onSelect={onSelect}
    onMoveStart={onMoveStart}
    onResizeStart={onResizeStart}
  >
    {asset?.dataUrl ? (
      <img src={asset.dataUrl} alt={asset.name ? `Изображение: ${asset.name}` : 'Изображение коммерческого предложения'} decoding="sync" />
    ) : (
      <span className="missing-image">Изображение недоступно</span>
    )}
  </ElementFrame>
);
