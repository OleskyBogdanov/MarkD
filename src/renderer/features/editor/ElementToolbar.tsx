import { useShallow } from 'zustand/react/shallow';
import { useLayoutEffect, useRef } from 'react';
import type { KpElement } from '@/renderer/domain/model';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { Inspector } from './Inspector';
import './element-toolbar.css';

const ELEMENT_LABELS: Record<KpElement['type'], string> = {
  text: 'Текст',
  textField: 'Текстовое поле',
  selectField: 'Выпадающий список',
  image: 'Изображение',
  shape: 'Фигура',
  table: 'Таблица'
};

export const ElementToolbar = () => {
  const toolbarRef = useRef<HTMLElement>(null);
  const { context, selectionKey } = useEditorStore(useShallow((state) => {
    const selected = state.selected;
    const element = selected.type === 'element'
      ? state.project.pages.find((page) => page.id === selected.pageId)
        ?.elements.find((candidate) => candidate.id === selected.elementId)
      : undefined;
    return {
      context: element ? ELEMENT_LABELS[element.type] : 'Документ',
      selectionKey: element?.id ?? 'document'
    };
  }));
  useLayoutEffect(() => {
    if (toolbarRef.current) toolbarRef.current.scrollLeft = 0;
  }, [selectionKey]);

  return (
    <section ref={toolbarRef} className="element-toolbar" aria-label="Панель инструментов элемента">
      {context !== 'Документ' ? <span className="element-toolbar-context">{context}</span> : null}
      <Inspector key={selectionKey} />
    </section>
  );
};
