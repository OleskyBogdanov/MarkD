type PendingEdit = { flush: () => void; isComposing: () => boolean };
const editors = new Set<PendingEdit>();

export const registerPendingEdit = (editor: PendingEdit): (() => void) => {
  editors.add(editor);
  return () => { editors.delete(editor); };
};

export const flushPendingEdits = (): void => {
  if ([...editors].some(editor => editor.isComposing())) {
    throw new Error('Завершите ввод текста и повторите действие.');
  }
  // Commit before reading the store, independent of React's next render.
  for (const editor of editors) editor.flush();
};
