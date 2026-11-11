import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { Button } from './button';
import './action-menu.css';

type MenuAction = {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
};

type ActionMenuProps = {
  readonly label: string;
  readonly actions: readonly MenuAction[];
  readonly disabled?: boolean;
  readonly above?: boolean;
  readonly iconOnly?: boolean;
};

export const ActionMenu = ({ label, actions, disabled = false, above = false, iconOnly = false }: ActionMenuProps) => {
  const id = useId();
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusLastRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    items[focusLastRef.current ? items.length - 1 : 0]?.focus();
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

  const open = (last = false): void => {
    focusLastRef.current = last;
    setOpen(true);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    const current = items.findIndex((item) => item === document.activeElement);
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return <div className={`action-menu${above ? ' action-menu-above' : ''}`} ref={rootRef}>
    <Button ref={triggerRef} variant="ghost" className={iconOnly ? 'icon-button action-menu-trigger' : 'action-menu-trigger'}
      aria-label={label} title={label} aria-haspopup="menu" aria-expanded={isOpen}
      aria-controls={isOpen ? id : undefined} disabled={disabled}
      onClick={() => isOpen ? setOpen(false) : open()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        open(event.key === 'ArrowUp');
      }}>
      {iconOnly ? <Ellipsis size={16} aria-hidden="true" /> : <>{label}<ChevronDown size={13} aria-hidden="true" /></>}
    </Button>
    {isOpen ? <div id={id} className="action-menu-popover" role="menu" aria-label={label} onKeyDown={handleKeyDown}>
      {actions.map((action, index) => <button key={action.label} type="button" role="menuitem"
        ref={(node) => { itemRefs.current[index] = node; }} tabIndex={-1}
        className={action.destructive ? 'action-menu-destructive' : undefined} disabled={action.disabled}
        onClick={() => { setOpen(false); triggerRef.current?.focus(); action.run(); }}>
        {action.label}
      </button>)}
    </div> : null}
  </div>;
};
