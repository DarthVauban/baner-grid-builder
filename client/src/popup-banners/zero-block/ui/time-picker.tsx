'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { AlertCircle, Clock3, X } from 'lucide-react';
import { Button, IconButton } from './components';

export type TimePickerProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
};

const pad = (value: number) => String(value).padStart(2, '0');
const valid = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Calendar-style field; wall-clock values belong to the caller's timezone. */
export function TimePicker({ label, value, defaultValue = '', onValueChange, disabled = false, error, hint, className }: TimePickerProps) {
  const id = useId();
  const [localValue, setLocalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const options = useRef(new Map<string, HTMLButtonElement>());
  const current = value === undefined ? localValue : value;
  const selected = valid(current);
  const [hour, minute] = selected ? current.split(':').map(Number) : [0, 0];
  const validationError = error || (current && !selected ? 'Час має бути у форматі HH:mm: від 00:00 до 23:59.' : undefined);
  const descriptions = [hint && `${id}-hint`, validationError && `${id}-error`].filter(Boolean).join(' ') || undefined;

  function change(next: string) {
    if (disabled) return;
    if (value === undefined) setLocalValue(next);
    onValueChange?.(next);
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, unit: 'hour' | 'minute', index: number, count: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowUp': next = (index + count - 1) % count; break;
      case 'ArrowDown': next = (index + 1) % count; break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
      case 'PageUp': next = Math.max(0, index - 5); break;
      case 'PageDown': next = Math.min(count - 1, index + 5); break;
      default: return;
    }
    event.preventDefault();
    options.current.get(`${unit}-${next}`)?.focus();
  }
  function column(unit: 'hour' | 'minute', title: string, count: number, active: number) {
    return <div className="ui-time-column">
      <p className="ui-time-label" id={`${id}-${unit}`}>{title}</p>
      <div role="listbox" aria-labelledby={`${id}-${unit}`} className="ui-time-list">
        {Array.from({ length: count }, (_, index) => <button key={index} type="button" role="option" aria-selected={selected && index === active} className="ui-time-option" tabIndex={index === active ? 0 : -1}
          ref={node => { if (node) options.current.set(`${unit}-${index}`, node); else options.current.delete(`${unit}-${index}`); }}
          onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest' })}
          onKeyDown={event => move(event, unit, index, count)}
          onClick={() => change(unit === 'hour' ? `${pad(index)}:${pad(minute)}` : `${pad(hour)}:${pad(index)}`)}>{pad(index)}</button>)}
      </div>
    </div>;
  }

  return <div className={['ui-field', 'ui-time-field', className].filter(Boolean).join(' ')} data-disabled={disabled || undefined}>
    <label className="ui-label" htmlFor={id}>{label}</label>
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger id={id} className="ui-input ui-date-trigger" disabled={disabled} aria-label={label} aria-describedby={descriptions} aria-invalid={!!validationError || undefined}>
        <span className={selected ? undefined : 'ui-date-placeholder'}>{selected ? current : 'Оберіть час'}</span><Clock3 size={17} aria-hidden="true"/>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="ui-positioner" sideOffset={8} align="start" collisionPadding={12} collisionAvoidance={{ side: 'flip', align: 'shift' }}>
          <Popover.Popup className="ui-popup ui-time-picker" initialFocus={() => options.current.get(`hour-${hour}`) ?? true} finalFocus={true}>
            <div className="ui-date-heading"><Popover.Title className="ui-date-title">Час: {label}</Popover.Title><Popover.Close render={<IconButton variant="ghost" size="sm" label="Закрити вибір часу" icon={<X size={16}/>} />}/></div>
            <div className="ui-time-columns">{column('hour', 'Години', 24, hour)}<span className="ui-time-colon" aria-hidden="true">:</span>{column('minute', 'Хвилини', 60, minute)}</div>
            <div className="ui-date-actions"><Button variant="ghost" size="sm" disabled={!current} onClick={() => { change(''); setOpen(false); }}>Очистити час</Button><Button size="sm" onClick={() => setOpen(false)}>Готово</Button></div>
            <Popover.Description className="ui-date-help">24-годинний формат. Стрілки — перехід, Enter або пробіл — вибір.</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
    {hint && <p className="ui-field-description" id={`${id}-hint`}>{hint}</p>}
    {validationError && <p className="ui-field-description ui-text-danger" id={`${id}-error`} role="alert"><AlertCircle size={13} aria-hidden="true"/>{validationError}</p>}
  </div>;
}
