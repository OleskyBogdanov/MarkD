type TextMeasurement = {
  height: number;
  clipped: boolean;
};

// Measure text fragments, not the scroll extent: the latter includes trailing
// padding, an empty textarea's minimum row, and integer rounding.
export const measureTextContent = (node: HTMLElement, checkClipping = true): TextMeasurement => {
  const style = getComputedStyle(node);
  const control = node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement;
  const text = node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement
    ? node.value || node.placeholder
    : node instanceof HTMLSelectElement
      ? node.selectedOptions[0]?.textContent || ''
      : node.textContent || '';
  const px = (value: string): number => Number.parseFloat(value) || 0;
  let target = node;
  let mirror: HTMLDivElement | undefined;
  if (control) {
    mirror = document.createElement('div');
    // Copy resolved typography and box metrics, including inherited CSS variables.
    for (const property of style) mirror.style.setProperty(property, style.getPropertyValue(property));
    Object.assign(mirror.style, {
      position: 'fixed', left: '0px', top: '0px', margin: '0px',
      width: style.width, height: 'auto', minHeight: '0px', maxHeight: 'none',
      minWidth: '0px', maxWidth: 'none', visibility: 'hidden', pointerEvents: 'none',
      transform: 'none', overflow: 'visible', contain: 'none',
      display: 'block', contentVisibility: 'visible'
    });
    mirror.textContent = text || '\u200b';
    document.body.append(mirror);
    target = mirror;
  }

  const box = node.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const height = targetBox.height;
  if (!checkClipping || !text) {
    mirror?.remove();
    return { height, clipped: false };
  }
  // DOM ranges supply the browser's wrapping and baseline positions. Their
  // rectangles contain the font's em box, including blank ascent/descent;
  // canvas ink metrics remove that blank space without a pixel tolerance.
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('Canvas text measurement is unavailable.');
  const range = document.createRange();
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const fragments: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  let child = walker.nextNode();
  while (child) {
    const value = child.textContent || '';
    if (!child.parentElement) throw new Error('Text measurement requires a parent element.');
    const textStyle = getComputedStyle(child.parentElement);
    context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
    context.fontKerning = textStyle.fontKerning === 'none' ? 'none' : textStyle.fontKerning === 'normal' ? 'normal' : 'auto';
    context.letterSpacing = textStyle.letterSpacing === 'normal' ? '0px' : textStyle.letterSpacing;
    context.wordSpacing = textStyle.wordSpacing === 'normal' ? '0px' : textStyle.wordSpacing;
    context.direction = textStyle.direction === 'rtl' ? 'rtl' : 'ltr';
    context.textAlign = 'left';
    range.selectNodeContents(child);
    const lines: Array<{ top: number; left: number }> = [];
    for (const rect of range.getClientRects()) {
      if (rect.width === 0) continue;
      const previous = lines.at(-1);
      if (previous?.top === rect.top) previous.left = Math.min(previous.left, rect.left);
      else lines.push({ top: rect.top, left: rect.left });
    }
    let start = 0;
    for (const line of lines) {
      let low = start;
      let high = value.length;
      while (low < high) {
        const offset = Math.floor((low + high) / 2);
        range.setStart(child, offset);
        range.setEnd(child, offset + 1);
        if (range.getBoundingClientRect().top <= line.top + 1 / 64) low = offset + 1;
        else high = offset;
      }
      const lineText = value.slice(start, low).replace(/[\r\n]/g, '');
      start = low;
      const metrics = context.measureText(textStyle.textTransform === 'uppercase' ? lineText.toUpperCase() : lineText);
      if (metrics.actualBoundingBoxAscent || metrics.actualBoundingBoxDescent) {
        const baseline = line.top + metrics.fontBoundingBoxAscent;
        fragments.push({
          left: line.left - metrics.actualBoundingBoxLeft,
          right: line.left + metrics.actualBoundingBoxRight,
          top: baseline - metrics.actualBoundingBoxAscent,
          bottom: baseline + metrics.actualBoundingBoxDescent
        });
      }
    }
    child = walker.nextNode();
  }
  const scaleX = control && targetBox.width ? box.width / targetBox.width : 1;
  // Native selects center their single text line vertically.
  const selectOffset = node instanceof HTMLSelectElement && fragments.length
    ? (box.height - targetBox.height) / 2
    : 0;
  const bounds = fragments.map(fragment => ({
    left: control ? box.left + (fragment.left - targetBox.left) * scaleX : fragment.left,
    right: control ? box.left + (fragment.right - targetBox.left) * scaleX : fragment.right,
    top: control ? box.top + fragment.top - targetBox.top + selectOffset : fragment.top,
    bottom: control ? box.top + fragment.bottom - targetBox.top + selectOffset : fragment.bottom
  }));
  mirror?.remove();
  if (bounds.length === 0) return { height, clipped: false };

  // A centered child can be clipped by its parent without overflowing itself.
  // Stop at the element content so scrolling the workspace never raises warnings.
  let ancestor: HTMLElement | null = node;
  let clipped = false;
  while (ancestor && !ancestor.classList.contains('canvas-element')) {
    const ancestorStyle = getComputedStyle(ancestor);
    const clipX = ancestor === node && control || /hidden|clip|auto|scroll/.test(ancestorStyle.overflowX);
    const clipY = ancestor === node && control || /hidden|clip|auto|scroll/.test(ancestorStyle.overflowY);
    if (clipX || clipY) {
      const rect = ancestor.getBoundingClientRect();
      const left = rect.left + px(ancestorStyle.borderLeftWidth);
      const right = rect.right - px(ancestorStyle.borderRightWidth) -
        (ancestor instanceof HTMLSelectElement ? px(ancestorStyle.paddingRight) : 0);
      const top = rect.top + px(ancestorStyle.borderTopWidth);
      const bottom = rect.bottom - px(ancestorStyle.borderBottomWidth);
      // Chromium lays out at 1/64 CSS px; permit only one layout quantum.
      clipped ||= bounds.some(fragment =>
        (clipX && (fragment.left < left - 1 / 64 || fragment.right > right + 1 / 64)) ||
        (clipY && (fragment.top < top - 1 / 64 || fragment.bottom > bottom + 1 / 64)));
    }
    ancestor = ancestor.parentElement;
  }
  return { height, clipped };
};
