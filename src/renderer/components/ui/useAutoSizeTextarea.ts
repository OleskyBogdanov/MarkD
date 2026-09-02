import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

type AutoSizeTextarea = {
  ref: RefObject<HTMLTextAreaElement | null>;
  resize: () => void;
};

export const useAutoSizeTextarea = (): AutoSizeTextarea => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback((): void => {
    const node = ref.current;
    const container = node?.parentElement;
    if (!node || !container) return;

    node.style.height = 'auto';
    const availableHeight = Math.max(1, container.clientHeight);
    const contentHeight = node.scrollHeight;
    node.style.height = `${Math.min(contentHeight, availableHeight)}px`;
    node.style.overflowY = contentHeight > availableHeight ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resize();
  });

  return { ref, resize };
};
