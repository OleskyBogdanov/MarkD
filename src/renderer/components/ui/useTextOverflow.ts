import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { measureTextContent } from './textMeasurement';

const textSelector = 'textarea, select, [data-overflow-text]';

export const useTextOverflow = (ref: RefObject<HTMLElement | null>, enabled: boolean, content: object, geometry: object): boolean => {
  const [hasOverflow, setHasOverflow] = useState(false);
  const frame = useRef<number | undefined>(undefined);
  const measure = useCallback(() => {
    const root = ref.current;
    const nodes = root
      ? root.matches(textSelector) ? [root] : Array.from(root.querySelectorAll<HTMLElement>(textSelector))
      : [];
    setHasOverflow(enabled && nodes.some(node => measureTextContent(node).clipped));
  }, [enabled, ref]);

  const scheduleMeasure = useCallback(() => {
    if (!enabled) {
      measure();
      return;
    }
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      measure();
    });
  }, [enabled, measure]);

  useLayoutEffect(scheduleMeasure, [content, geometry, scheduleMeasure]);

  useLayoutEffect(() => {
    scheduleMeasure();
    // The content container survives switching a shape between text and editing.
    const root = ref.current?.closest('.canvas-element-content') ?? ref.current;
    if (!enabled || !root) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(root);
    const contentObserver = new MutationObserver(scheduleMeasure);
    contentObserver.observe(root, { subtree: true, childList: true, characterData: true });
    root.addEventListener('input', scheduleMeasure);
    root.addEventListener('change', scheduleMeasure);
    document.fonts.addEventListener('loadingdone', scheduleMeasure);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      root.removeEventListener('input', scheduleMeasure);
      root.removeEventListener('change', scheduleMeasure);
      document.fonts.removeEventListener('loadingdone', scheduleMeasure);
    };
  }, [enabled, ref, scheduleMeasure]);

  return hasOverflow;
};
