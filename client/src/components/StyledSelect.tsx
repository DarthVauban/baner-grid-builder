import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type SelectValue = string | number;

export interface StyledSelectOption<T extends SelectValue = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface StyledSelectProps<T extends SelectValue = string> {
  value: T;
  options: Array<StyledSelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

function sameValue(left: SelectValue, right: SelectValue) {
  return String(left) === String(right);
}

export function StyledSelect<T extends SelectValue = string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
  compact = false,
  searchable = false,
  searchPlaceholder = 'Пошук'
}: StyledSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [search, setSearch] = useState('');
  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uk-UA');
    if (!searchable || !needle) return options;
    return options.filter((option) => option.label.toLocaleLowerCase('uk-UA').includes(needle));
  }, [options, search, searchable]);
  const selectedIndex = Math.max(0, filteredOptions.findIndex((option) => sameValue(option.value, value)));
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const selected = useMemo(
    () => options.find((option) => sameValue(option.value, value)) || options[0],
    [options, value]
  );

  useEffect(() => setHighlighted(selectedIndex), [selectedIndex]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return undefined;
    }
    if (!searchable) return undefined;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const gap = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 140), viewportWidth - gap * 2);
      const left = Math.min(Math.max(rect.left, gap), viewportWidth - width - gap);
      const belowSpace = viewportHeight - rect.bottom - gap;
      const aboveSpace = rect.top - gap;
      const opensUp = belowSpace < 170 && aboveSpace > belowSpace;
      const maxHeight = Math.max(96, Math.min(240, opensUp ? aboveSpace - 6 : belowSpace - 6));
      const top = opensUp
        ? Math.max(gap, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, viewportHeight - gap - maxHeight);

      setMenuStyle({ left, top, width, maxHeight });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, filteredOptions.length]);

  function move(step: number) {
    if (!filteredOptions.length) return;
    setOpen(true);
    setHighlighted((current) => {
      let next = current;
      for (let attempt = 0; attempt < filteredOptions.length; attempt += 1) {
        next = (next + step + filteredOptions.length) % filteredOptions.length;
        if (!filteredOptions[next]?.disabled) return next;
      }
      return current;
    });
  }

  function selectOption(option: StyledSelectOption<T>) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && filteredOptions[highlighted]) selectOption(filteredOptions[highlighted]);
      else setOpen(true);
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions[highlighted]) selectOption(filteredOptions[highlighted]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  const menu = <div ref={menuRef} className={`custom-select__menu custom-select__menu--portal${compact ? ' custom-select__menu--compact' : ''}`} role="listbox" aria-label={ariaLabel} style={menuStyle}>
    {searchable && <div className="custom-select__search">
      <Icon name="search" size={15} />
      <input
        ref={searchInputRef}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
    </div>}
    {filteredOptions.map((option, index) => {
      const active = sameValue(option.value, value);
      const highlightedOption = index === highlighted;
      return <button
        key={String(option.value)}
        className={`${active ? 'active ' : ''}${highlightedOption ? 'highlighted' : ''}`.trim()}
        type="button"
        role="option"
        aria-selected={active}
        disabled={option.disabled}
        onMouseEnter={() => setHighlighted(index)}
        onClick={() => selectOption(option)}
      >
        <span>{option.label}</span>
        {active && <Icon name="check" size={15} />}
      </button>;
    })}
    {!filteredOptions.length && <div className="custom-select__empty">Нічого не знайдено</div>}
  </div>;

  return <div className={`custom-select${compact ? ' custom-select--compact' : ''}${open ? ' custom-select--open' : ''}${className ? ` ${className}` : ''}`} ref={rootRef}>
    <button
      ref={buttonRef}
      className="custom-select__button"
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => !disabled && setOpen((current) => !current)}
      onKeyDown={handleKeyDown}
    >
      <span>{selected?.label || ''}</span>
      <Icon name="chevronRight" size={17} />
    </button>
    {open && createPortal(menu, document.body)}
  </div>;
}
