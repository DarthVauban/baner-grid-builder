import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  compact = false
}: StyledSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => sameValue(option.value, value)));
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const selected = useMemo(
    () => options.find((option) => sameValue(option.value, value)) || options[0],
    [options, value]
  );

  useEffect(() => setHighlighted(selectedIndex), [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  function move(step: number) {
    if (!options.length) return;
    setOpen(true);
    setHighlighted((current) => {
      let next = current;
      for (let attempt = 0; attempt < options.length; attempt += 1) {
        next = (next + step + options.length) % options.length;
        if (!options[next]?.disabled) return next;
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
      if (open && options[highlighted]) selectOption(options[highlighted]);
      else setOpen(true);
    }
  }

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
    {open && <div className="custom-select__menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => {
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
    </div>}
  </div>;
}
