import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  FileDown,
  FileInput,
  FileUp,
  Image,
  ListFilter,
  LoaderCircle,
  Minus,
  Plus,
  Redo2,
  SquarePlus,
  Square,
  Table2,
  Trash2,
  Type,
  Triangle,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import type { KpSelection } from '@/renderer/store/useEditorStore';
import type { ShapeKind } from '@/renderer/domain/model';

type ToolbarProps = {
  onAddPage: () => void;
  onAddText: () => void;
  onAddTextField: () => void;
  onAddSelectField: () => void;
  onAddTable: () => void;
  onAddImage: () => void;
  onAddShape: (shape: ShapeKind) => void;
  onSave: () => void;
  onOpen: () => void;
  selected: KpSelection;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  onTogglePreview: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  isBusy: boolean;
  isPreview: boolean;
  zoom: number;
};

export const Toolbar = ({
  onAddPage,
  onAddText,
  onAddTextField,
  onAddSelectField,
  onAddTable,
  onAddImage,
  onAddShape,
  onSave,
  onOpen,
  onUndo,
  onRedo,
  onDelete,
  onZoomIn,
  onZoomOut,
  onExport,
  onTogglePreview,
  selected,
  canUndo,
  canRedo,
  isDirty,
  isBusy,
  isPreview,
  zoom
}: ToolbarProps) => {
  const [isAddMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAddMenuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !addMenuRef.current?.contains(event.target)) setAddMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAddMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isAddMenuOpen]);

  const runAddAction = (action: () => void): void => {
    action();
    setAddMenuOpen(false);
  };

  return (
    <nav className="toolbar-wrap" aria-label="Инструменты документа">
      <div className="toolbar-group toolbar-history">
        <Button className="icon-button" onClick={onUndo} title="Отменить" aria-label="Отменить" disabled={isPreview || !canUndo}><Undo2 size={16} aria-hidden="true" /></Button>
        <Button className="icon-button" onClick={onRedo} title="Повторить" aria-label="Повторить" disabled={isPreview || !canRedo}><Redo2 size={16} aria-hidden="true" /></Button>
        <Button className="icon-button danger-icon" onClick={onDelete} title="Удалить выбранный" aria-label="Удалить выбранный" disabled={isPreview || selected.type === 'none'}><Trash2 size={16} aria-hidden="true" /></Button>
      </div>

      <div className="add-menu" ref={addMenuRef}>
        <Button
          className="add-menu-trigger"
          onClick={() => setAddMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={isAddMenuOpen}
          disabled={isBusy || isPreview}
        >
          <Plus size={16} aria-hidden="true" /> <span>Добавить</span> <ChevronDown size={14} aria-hidden="true" />
        </Button>
        {isAddMenuOpen ? (
          <div className="add-menu-popover" role="menu" aria-label="Добавить элемент">
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddText)}><Type aria-hidden="true" /><span><strong>Текст</strong><small>Свободный текстовый блок</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddTextField)}><FileInput aria-hidden="true" /><span><strong>Текстовое поле</strong><small>Подпись, значение и иконка</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddSelectField)}><ListFilter aria-hidden="true" /><span><strong>Выпадающий список</strong><small>Выбор из устойчивых вариантов</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddTable)}><Table2 aria-hidden="true" /><span><strong>Таблица</strong><small>Строки и колонки предложения</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddImage)}><Image aria-hidden="true" /><span><strong>Изображение</strong><small>PNG, JPG или WebP</small></span></button>
            <div className="add-menu-section-label" role="presentation">Фигуры</div>
            <button type="button" role="menuitem" onClick={() => runAddAction(() => onAddShape('rectangle'))}><Square aria-hidden="true" /><span><strong>Прямоугольник</strong><small>Заливка и граница</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(() => onAddShape('ellipse'))}><Circle aria-hidden="true" /><span><strong>Эллипс</strong><small>Заливка и граница</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(() => onAddShape('triangle'))}><Triangle aria-hidden="true" /><span><strong>Треугольник</strong><small>Заливка и граница</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(() => onAddShape('line'))}><Minus aria-hidden="true" /><span><strong>Линия</strong><small>Цвет, толщина и штрих</small></span></button>
            <button type="button" role="menuitem" onClick={() => runAddAction(onAddPage)}><SquarePlus aria-hidden="true" /><span><strong>Страница</strong><small>Новый чистый лист A4</small></span></button>
          </div>
        ) : null}
      </div>

      <div className="toolbar-group toolbar-zoom">
        <Button className="icon-button" onClick={onZoomOut} variant="ghost" title="Уменьшить" aria-label="Уменьшить" disabled={zoom <= 0.5}><ZoomOut size={16} aria-hidden="true" /></Button>
        <Button className="icon-button" onClick={onZoomIn} variant="ghost" title="Увеличить" aria-label="Увеличить" disabled={zoom >= 2}><ZoomIn size={16} aria-hidden="true" /></Button>
      </div>

      <Button
        className={`icon-button preview-button ${isPreview ? 'active' : ''}`}
        onClick={onTogglePreview}
        variant="ghost"
        title={isPreview ? 'Вернуться к редактированию' : 'Предпросмотр документа'}
        aria-label={isPreview ? 'Вернуться к редактированию' : 'Открыть предпросмотр'}
        aria-pressed={isPreview}
      >
        {isPreview ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </Button>

      <div className="toolbar-group toolbar-file-actions">
        <Button onClick={onOpen} title="Открыть .markd" aria-label="Открыть" variant="ghost" disabled={isBusy}><FileDown size={16} aria-hidden="true" /><span className="button-label">Открыть</span></Button>
        <Button onClick={onSave} title="Сохранить .markd" aria-label="Сохранить" variant="outline" disabled={isBusy}>
          {isBusy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
          <span className="button-label">{isDirty ? 'Сохранить ·' : 'Сохранить'}</span>
        </Button>
        <Button className="export-button" onClick={onExport} title="Экспорт PDF" disabled={isBusy}><FileUp size={16} aria-hidden="true" /><span>PDF</span></Button>
      </div>
    </nav>
  );
};
