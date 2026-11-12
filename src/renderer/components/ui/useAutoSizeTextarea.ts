import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { measureTextContent } from './textMeasurement';

type AutoSizeTextarea = {
  ref: RefObject<HTMLTextAreaElement | null>;
  resize: () => void;
};

export const useAutoSizeTextarea = (value: string, layoutKey: string): AutoSizeTextarea => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback((): void => {
    const node = ref.current;
    const container = node?.parentElement;
    if (!node || !container) return;

    const containerStyle = getComputedStyle(container);
    const availableHeight = Math.max(0, Number.parseFloat(containerStyle.height) -
      (Number.parseFloat(containerStyle.borderTopWidth) || 0) -
      (Number.parseFloat(containerStyle.borderBottomWidth) || 0) -
      (Number.parseFloat(containerStyle.paddingTop) || 0) -
      (Number.parseFloat(containerStyle.paddingBottom) || 0));
    const contentHeight = measureTextContent(node, false).height;
    node.style.height = `${Math.min(contentHeight, availableHeight)}px`;
    node.style.overflowY = contentHeight > availableHeight ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [layoutKey, resize, value]);

  useLayoutEffect(() => {
    const node = ref.current;
    const container = node?.parentElement;
    if (!node || !container) return;
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const contentObserver = new MutationObserver(resize);
    contentObserver.observe(node, { childList: true, characterData: true, subtree: true });
    document.fonts.addEventListener('loadingdone', resize);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      document.fonts.removeEventListener('loadingdone', resize);
    };
  }, [layoutKey, resize]);

  return { ref, resize };
};
