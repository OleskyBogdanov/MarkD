import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
import { measureTextContent } from './textMeasurement';

const textSelector = 'textarea, select, [data-overflow-text]';

export const useTextOverflow = (ref: RefObject<HTMLElement | null>, enabled: boolean): boolean => {
  const [hasOverflow, setHasOverflow] = useState(false);
  const measure = useCallback(() => {
    const root = ref.current;
    const nodes = root
      ? root.matches(textSelector) ? [root] : Array.from(root.querySelectorAll<HTMLElement>(textSelector))
      : [];
    setHasOverflow(enabled && nodes.some(node => measureTextContent(node).clipped));
  }, [enabled, ref]);

  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll(textSelector).forEach(node => observer.observe(node));
    // Buffered controls update their draft after the containing renderer commits.
    const contentObserver = new MutationObserver(measure);
    contentObserver.observe(root, { subtree: true, childList: true, characterData: true });
    // Native listeners run before React's delegated change handler. Even a
    // microtask can run between those listeners and restore the old draft.
    let frame: number | undefined;
    const onInput = (): void => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    document.fonts.addEventListener('loadingdone', measure);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      document.fonts.removeEventListener('loadingdone', measure);
    };
  });

  return hasOverflow;
};
