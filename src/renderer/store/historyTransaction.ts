import type { KpAsset } from '@/renderer/domain/model';
import { useEditorStore } from './useEditorStore';

export const runHistoryTransaction = (action: () => void): void => {
  const state = useEditorStore.getState();
  state.beginHistoryTransaction();
  try { action(); }
  finally { state.endHistoryTransaction(); }
};

type ImageInsertion = {
  readonly pageId: string;
  readonly asset: KpAsset;
  readonly center?: { readonly x: number; readonly y: number };
};

export const insertImageWithAsset = ({ pageId, asset, center }: ImageInsertion): void => {
  const state = useEditorStore.getState();
  const layer = state.project.layers.find(item => item.id === state.activeLayerId);
  if (!layer?.visible || layer.locked || !state.project.pages.some(page => page.id === pageId)) return;
  runHistoryTransaction(() => {
    state.addAsset(asset);
    state.addImage(pageId, asset.id, center);
  });
};
