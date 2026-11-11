import { Eye, FileUp, LoaderCircle, PanelRight, Redo2, Save, Undo2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/renderer/components/ui/button';
import { ActionMenu } from '@/renderer/components/ui/ActionMenu';
import { AddElementMenu } from '@/renderer/components/toolbar/AddElementMenu';
import type { ShapeKind } from '@/renderer/domain/model';
import './toolbar.css';

type ToolbarProps = {
  onAddPage: () => void;
  onAddText: () => void;
  onAddTextField: () => void;
  onAddSelectField: () => void;
  onAddTable: () => void;
  onAddImage: () => void;
  onAddShape: (shape: ShapeKind) => void;
  onSaveFile: () => void;
  onSaveAs: () => void;
  onSaveCopy: () => void;
  onReveal?: () => void;
  onSaveTemplate: () => void;
  onOpen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onTogglePreview: () => void;
  onToggleStructure: () => void;
  sidebarVisible: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isBusy: boolean;
};

export const Toolbar = ({
  onAddPage, onAddText, onAddTextField, onAddSelectField, onAddTable, onAddImage, onAddShape,
  onSaveFile, onSaveTemplate, onSaveAs, onSaveCopy, onReveal, onOpen,
  onUndo, onRedo, onExport, onTogglePreview, onToggleStructure,
  sidebarVisible, canUndo, canRedo, isDirty, isBusy
}: ToolbarProps) => {
  const previewHintId = useId();
  return (
  <nav className="toolbar-wrap" aria-label="Инструменты документа">
    <div className="toolbar-group toolbar-edit-actions">
      <ActionMenu label="Файл" disabled={isBusy} actions={[
        { label: 'Открыть', run: onOpen },
        { label: 'Сохранить файл', run: onSaveFile },
        { label: 'Сохранить как…', run: onSaveAs },
        { label: 'Сохранить копию…', run: onSaveCopy },
        { label: 'Сохранить как шаблон', run: onSaveTemplate },
        ...(onReveal ? [{ label: 'Показать файл', run: onReveal }] : [])
      ]} />
      <Button className="icon-button" onClick={onUndo} title="Отменить" aria-label="Отменить" disabled={!canUndo}><Undo2 size={16} aria-hidden="true" /></Button>
      <Button className="icon-button" onClick={onRedo} title="Повторить" aria-label="Повторить" disabled={!canRedo}><Redo2 size={16} aria-hidden="true" /></Button>
      <AddElementMenu disabled={isBusy} onAddPage={onAddPage} onAddText={onAddText}
        onAddTextField={onAddTextField} onAddSelectField={onAddSelectField} onAddTable={onAddTable}
        onAddImage={onAddImage} onAddShape={onAddShape} />
    </div>
    <div className="toolbar-group toolbar-view">
      <span className="preview-control">
        <Button className="icon-button" onClick={onTogglePreview} variant="ghost"
          aria-describedby={previewHintId} aria-label="Открыть предпросмотр"><Eye size={17} aria-hidden="true" /></Button>
        <span className="preview-hint" id={previewHintId} role="tooltip">Предпросмотр документа</span>
      </span>
      <Button onClick={onToggleStructure} variant="ghost" aria-pressed={sidebarVisible}
        title="Структура" aria-label="Структура"><PanelRight size={16} aria-hidden="true" /><span>Структура</span></Button>
    </div>
    <div className="toolbar-group toolbar-file-actions">
      <Button onClick={onSaveFile} title="Сохранить" aria-label={isDirty ? 'Сохранить ·' : 'Сохранить'}
        disabled={isBusy} variant="outline">
        {isBusy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        <span>{isDirty ? 'Сохранить ·' : 'Сохранить'}</span>
      </Button>
      <Button className="export-button" onClick={onExport} title="Экспорт PDF" disabled={isBusy}>
        <FileUp size={16} aria-hidden="true" /><span>PDF</span>
      </Button>
    </div>
  </nav>
  );
};
