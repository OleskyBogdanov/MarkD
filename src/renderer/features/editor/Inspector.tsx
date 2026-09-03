import { useMemo } from 'react';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { DocumentInspector } from './inspector/DocumentInspector';
import { ImageInspector } from './inspector/ImageInspector';
import { SelectFieldInspector } from './inspector/SelectFieldInspector';
import { ShapeInspector } from './inspector/ShapeInspector';
import { TableInspector } from './inspector/TableInspector';
import { TextFieldInspector } from './inspector/TextFieldInspector';
import { TextInspector } from './inspector/TextInspector';
import './inspector/inspector.css';

export const Inspector = () => {
  const project = useEditorStore((state) => state.project);
  const selected = useEditorStore((state) => state.selected);

  const selectedElement = useMemo(() => {
    if (selected.type !== 'element') return null;
    const page = project.pages.find((item) => item.id === selected.pageId);
    const element = page?.elements.find((candidate) => candidate.id === selected.elementId);
    return page && element ? { page, element } : null;
  }, [project, selected]);

  if (!selectedElement) return <DocumentInspector project={project} />;

  const { element, page } = selectedElement;

  switch (element.type) {
    case 'text':
      return <TextInspector element={element} pageId={page.id} />;
    case 'textField':
      return <TextFieldInspector element={element} pageId={page.id} />;
    case 'selectField':
      return <SelectFieldInspector element={element} pageId={page.id} />;
    case 'image':
      return (
        <ImageInspector
          assetName={project.assets.find((asset) => asset.id === element.assetId)?.name}
          element={element}
          page={page}
        />
      );
    case 'shape':
      return <ShapeInspector element={element} pageId={page.id} />;
    case 'table':
      return <TableInspector element={element} pageId={page.id} />;
    default:
      return null;
  }
};
