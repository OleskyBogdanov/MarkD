import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, CircleOff, Search, X } from 'lucide-react';
import type { IconName } from '@/renderer/domain/model';
import { DOCUMENT_ICON_REGISTRY, ICON_GROUPS, ICON_LABELS } from '@/renderer/domain/iconRegistry';
import './icon-picker.css';

type IconPickerProps = {
  value?: IconName;
  onChange: (value: IconName | undefined) => void;
};

const GRID_COLUMNS = 6;

export const IconPicker = ({ value, onChange }: IconPickerProps) => {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedLabel = value ? ICON_LABELS[value] : 'Без иконки';
  const SelectedIcon = value ? DOCUMENT_ICON_REGISTRY[value] : CircleOff;
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    if (!normalizedQuery) return ICON_GROUPS;
    return ICON_GROUPS.flatMap((group) => {
      if (group.label.toLocaleLowerCase('ru').includes(normalizedQuery)) return [group];
      const icons = group.icons.filter((iconName) => ICON_LABELS[iconName].toLocaleLowerCase('ru').includes(normalizedQuery));
      return icons.length ? [{ ...group, icons }] : [];
    });
  }, [query]);
  const selectedIconIsVisible = value !== undefined
    && filteredGroups.some((group) => group.icons.includes(value));
  const tabStopIconName = value === undefined
    ? undefined
    : selectedIconIsVisible
      ? value
      : filteredGroups[0]?.icons[0];

  const close = (restoreFocus = false): void => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const select = (iconName: IconName | undefined): void => {
    onChange(iconName);
    close(true);
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof HTMLButtonElement) || event.target.dataset['iconOption'] === undefined) return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-icon-option]'));
    const currentIndex = options.indexOf(event.target);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = Math.min(options.length - 1, currentIndex + 1);
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, currentIndex + GRID_COLUMNS);
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - GRID_COLUMNS);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    options[nextIndex]?.focus();
  };

  return (
    <div
      className="icon-picker"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <span className="inspector-field-label">Иконка</span>
      <button
        ref={triggerRef}
        className="icon-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'text-field-icon-picker' : undefined}
        onClick={() => isOpen ? close() : setOpen(true)}
      >
        <span className="icon-picker-trigger-preview" aria-hidden="true"><SelectedIcon /></span>
        <span className="icon-picker-trigger-copy"><span>Выбрано</span><strong>{selectedLabel}</strong></span>
        <ChevronDown className="icon-picker-chevron" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          id="text-field-icon-picker"
          className="icon-picker-panel"
          role="dialog"
          aria-label="Выбор иконки"
          onKeyDown={handleGridKeyDown}
        >
          <label className="icon-picker-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Поиск иконки</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Найти иконку"
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query ? (
              <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X aria-hidden="true" /></button>
            ) : null}
          </label>

          <button
            className="icon-picker-none"
            type="button"
            data-icon-option=""
            aria-pressed={value === undefined}
            tabIndex={tabStopIconName === undefined ? 0 : -1}
            onClick={() => select(undefined)}
          >
            <CircleOff aria-hidden="true" />
            <span>Без иконки</span>
            {value === undefined ? <span className="icon-picker-selected-mark" aria-hidden="true">✓</span> : null}
          </button>

          {filteredGroups.length ? filteredGroups.map((group, groupIndex) => (
            <section className="icon-picker-group" key={group.label} aria-labelledby={`icon-picker-group-${groupIndex}`}>
              <h4 id={`icon-picker-group-${groupIndex}`}>{group.label}</h4>
              <div className="icon-picker-grid">
                {group.icons.map((iconName) => {
                  const Icon = DOCUMENT_ICON_REGISTRY[iconName];
                  const selected = iconName === value;
                  return (
                    <button
                      type="button"
                      data-icon-option={iconName}
                      key={iconName}
                      aria-label={ICON_LABELS[iconName]}
                      aria-pressed={selected}
                      title={ICON_LABELS[iconName]}
                      tabIndex={iconName === tabStopIconName ? 0 : -1}
                      onClick={() => select(iconName)}
                    >
                      <Icon aria-hidden="true" />
                      {selected ? <span className="icon-picker-selected-mark" aria-hidden="true">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          )) : <p className="icon-picker-empty">Ничего не найдено</p>}
        </div>
      ) : null}
    </div>
  );
};
