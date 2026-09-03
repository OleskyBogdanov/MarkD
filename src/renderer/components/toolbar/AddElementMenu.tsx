import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Circle, FileInput, Image, ListFilter, Minus, Plus, Square, SquarePlus, Table2, Triangle, Type } from 'lucide-react';
import type { ShapeKind } from '@/renderer/domain/model';
import { Button } from '@/renderer/components/ui/button';

type AddElementMenuProps = {
  disabled: boolean;
  onAddPage: () => void;
  onAddText: () => void;
  onAddTextField: () => void;
  onAddSelectField: () => void;
  onAddTable: () => void;
  onAddImage: () => void;
  onAddShape: (shape: ShapeKind) => void;
};

export const AddElementMenu = ({
  disabled,
  onAddPage,
  onAddText,
  onAddTextField,
  onAddSelectField,
  onAddTable,
  onAddImage,
  onAddShape
}: AddElementMenuProps) => {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialFocusIndexRef = useRef(0);

  const actions = [
    { label: 'Текст', description: 'Свободный текст', icon: Type, run: onAddText },
    { label: 'Текстовое поле', description: 'Подпись и значение', icon: FileInput, run: onAddTextField },
    { label: 'Выпадающий список', description: 'Выбор из вариантов', icon: ListFilter, run: onAddSelectField },
    { label: 'Таблица', description: 'Строки и столбцы', icon: Table2, run: onAddTable },
    { label: 'Изображение', description: 'PNG, JPG или WebP', icon: Image, run: onAddImage },
    { label: 'Прямоугольник', description: 'Заливка и контур', icon: Square, run: () => onAddShape('rectangle') },
    { label: 'Эллипс', description: 'Заливка и контур', icon: Circle, run: () => onAddShape('ellipse') },
    { label: 'Треугольник', description: 'Заливка и контур', icon: Triangle, run: () => onAddShape('triangle') },
    { label: 'Линия', description: 'Цвет, толщина и штрих', icon: Minus, run: () => onAddShape('line') },
    { label: 'Страница', description: 'Новый лист A4', icon: SquarePlus, run: onAddPage }
  ];

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[initialFocusIndexRef.current]?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const open = (focusIndex = 0): void => {
    initialFocusIndexRef.current = focusIndex;
    setOpen(true);
  };

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'Tab') setOpen(false);
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const renderAction = (action: (typeof actions)[number], index: number, compact = false) => {
    const Icon = action.icon;
    return (
      <button
        className={`add-menu-item${compact ? ' add-menu-item-compact' : ''}`}
        key={action.label}
        ref={(node) => { itemRefs.current[index] = node; }}
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={() => run(action.run)}
      >
        <span className="add-menu-item-icon" aria-hidden="true"><Icon /></span>
        <span className="add-menu-item-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
      </button>
    );
  };

  return (
    <div className="add-menu" ref={rootRef}>
      <Button
        ref={triggerRef}
        className="add-menu-trigger"
        onClick={() => isOpen ? setOpen(false) : open()}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          open(event.key === 'ArrowUp' ? actions.length - 1 : 0);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'add-element-menu' : undefined}
        disabled={disabled}
      >
        <Plus size={16} aria-hidden="true" /> <span>Добавить</span> <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {isOpen ? (
        <div id="add-element-menu" className="add-menu-popover" role="menu" aria-label="Добавить компонент" onKeyDown={handleMenuKeyDown}>
          <div className="add-menu-group" role="group" aria-label="Элементы документа">
            {actions.slice(0, 5).map((action, index) => renderAction(action, index))}
          </div>
          <div className="add-menu-shapes-group" role="group" aria-labelledby="add-menu-shapes-label">
            <div id="add-menu-shapes-label" className="add-menu-section-label">Фигуры</div>
            <div className="add-menu-shapes-grid">
              {actions.slice(5, 9).map((action, index) => renderAction(action, index + 5, true))}
            </div>
          </div>
          <div className="add-menu-page-group" role="group" aria-label="Страница">
            {renderAction(actions[9], 9)}
          </div>
        </div>
      ) : null}
    </div>
  );
};
