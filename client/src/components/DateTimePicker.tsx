import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

interface DateTimePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: 'date' | 'datetime';
  required?: boolean;
  className?: string;
}

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const minuteOptions = ['00', '15', '30', '45'];
const hourOptions = Array.from({ length: 24 }, (_, index) => {
  const value = pad(index);
  return { value, label: value };
});

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function datePart(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseValue(value: string) {
  const [date = '', time = '09:00'] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = year && month && day ? new Date(year, month - 1, day) : new Date();
  parsed.setHours(0, 0, 0, 0);
  return { date: Number.isNaN(parsed.getTime()) ? new Date() : parsed, time: /^\d{2}:\d{2}$/.test(time) ? time : '09:00' };
}

function monthMatrix(viewDate: Date) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function DateTimePicker({ label, value, onChange, mode = 'datetime', required = false, className = '' }: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(parsed.date);
  const selectedDate = parsed.date;
  const [hour, minute] = parsed.time.split(':');
  const minutes = minuteOptions.includes(minute) ? minuteOptions : [...minuteOptions, minute].sort();
  const minuteSelectOptions = minutes.map((item) => ({ value: item, label: item }));

  useEffect(() => setViewDate(parsed.date), [parsed.date.getFullYear(), parsed.date.getMonth()]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  function emit(nextDate: Date, nextTime = parsed.time) {
    const nextDatePart = datePart(nextDate);
    onChange(mode === 'date' ? nextDatePart : `${nextDatePart}T${nextTime}`);
  }

  function setTime(nextHour: string, nextMinute: string) {
    emit(selectedDate, `${nextHour}:${nextMinute}`);
  }

  const days = monthMatrix(viewDate);
  const display = value
    ? new Intl.DateTimeFormat('uk-UA', mode === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(mode === 'date' ? selectedDate : new Date(`${datePart(selectedDate)}T${parsed.time}`))
    : 'Оберіть дату';

  return <div className={`field date-time-field ${className}`.trim()} ref={rootRef}>
    <span>{label}</span>
    <button className="date-time-trigger" type="button" aria-expanded={open} aria-required={required} onClick={() => setOpen((current) => !current)}>
      <Icon name="calendar" size={18} />
      <strong>{display}</strong>
    </button>
    {open && <div className="modal-backdrop modal-backdrop--nested date-time-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="date-time-picker date-time-picker--modal" role="dialog" aria-modal="true" aria-label={label}>
      <header className="date-time-picker__header">
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} aria-label="Попередній місяць"><Icon name="chevronLeft" size={18} /></button>
        <strong>{new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' }).format(viewDate)}</strong>
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} aria-label="Наступний місяць"><Icon name="chevronRight" size={18} /></button>
      </header>
      <div className="date-time-picker__weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-time-picker__days">
        {days.map((day) => {
          const active = datePart(day) === datePart(selectedDate);
          const outside = day.getMonth() !== viewDate.getMonth();
          const today = datePart(day) === datePart(new Date());
          return <button className={`${active ? 'active ' : ''}${outside ? 'outside ' : ''}${today ? 'today' : ''}`.trim()} type="button" key={datePart(day)} onClick={() => emit(day)}>
            {day.getDate()}
          </button>;
        })}
      </div>
      {mode === 'datetime' && <div className="date-time-picker__time">
        <span>Час</span>
        <StyledSelect compact value={hour} options={hourOptions} onChange={(nextHour) => setTime(nextHour, minute)} ariaLabel="Година" />
        <b>:</b>
        <StyledSelect compact value={minute} options={minuteSelectOptions} onChange={(nextMinute) => setTime(hour, nextMinute)} ariaLabel="Хвилини" />
      </div>}
      <footer className="date-time-picker__footer">
        <button className="button button--secondary button--small" type="button" onClick={() => emit(new Date())}>Сьогодні</button>
        <button className="button button--primary button--small" type="button" onClick={() => setOpen(false)}>Готово</button>
      </footer>
      </section>
    </div>}
  </div>;
}
