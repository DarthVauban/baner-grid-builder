import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

interface TimeRangePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

type TimeRange = {
  open: string;
  close: string;
};

const hourOptions = Array.from({ length: 24 }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const defaultMinutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const presets: TimeRange[] = [
  { open: '08:00', close: '19:30' },
  { open: '09:00', close: '20:00' },
  { open: '10:00', close: '19:00' }
];

function parseRange(value: string): TimeRange {
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]\d|2[0-3]):([0-5]\d)$/);
  return match
    ? { open: `${match[1]}:${match[2]}`, close: `${match[3]}:${match[4]}` }
    : presets[0];
}

function timeParts(value: string) {
  const [hour = '08', minute = '00'] = value.split(':');
  return { hour, minute };
}

function minuteOptions(current: string) {
  const values = defaultMinutes.includes(current)
    ? defaultMinutes
    : [...defaultMinutes, current].sort();
  return values.map((value) => ({ value, label: value }));
}

export function TimeRangePicker({
  label,
  value,
  onChange,
  required = false,
  className = ''
}: TimeRangePickerProps) {
  const parsed = useMemo(() => parseRange(value), [value]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimeRange>(parsed);
  const openParts = timeParts(draft.open);
  const closeParts = timeParts(draft.close);

  function showPicker() {
    setDraft(parsed);
    setOpen(true);
  }

  function setTime(kind: keyof TimeRange, hour: string, minute: string) {
    setDraft((current) => ({ ...current, [kind]: `${hour}:${minute}` }));
  }

  function apply() {
    onChange(`${draft.open} - ${draft.close}`);
    setOpen(false);
  }

  return <div className={`field date-time-field ${className}`.trim()}>
    <span>{label}</span>
    <button
      className="date-time-trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-required={required}
      onClick={showPicker}
    >
      <Icon name="schedule" size={18} />
      <strong>{value || 'Оберіть час роботи'}</strong>
    </button>
    {open && <div
      className="modal-backdrop modal-backdrop--nested date-time-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
    >
      <section className="date-time-picker time-range-picker" role="dialog" aria-modal="true" aria-label={label}>
        <header className="time-range-picker__header">
          <span><Icon name="schedule" size={20} /></span>
          <div><strong>Час роботи</strong><small>Оберіть час відкриття та зачинення</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Закрити вибір часу"><Icon name="close" size={18} /></button>
        </header>
        <div className="time-range-picker__ranges">
          <section>
            <span>Відкриття</span>
            <div>
              <StyledSelect compact value={openParts.hour} options={hourOptions} onChange={(hour) => setTime('open', hour, openParts.minute)} ariaLabel="Година відкриття" />
              <b>:</b>
              <StyledSelect compact value={openParts.minute} options={minuteOptions(openParts.minute)} onChange={(minute) => setTime('open', openParts.hour, minute)} ariaLabel="Хвилини відкриття" />
            </div>
          </section>
          <section>
            <span>Зачинення</span>
            <div>
              <StyledSelect compact value={closeParts.hour} options={hourOptions} onChange={(hour) => setTime('close', hour, closeParts.minute)} ariaLabel="Година зачинення" />
              <b>:</b>
              <StyledSelect compact value={closeParts.minute} options={minuteOptions(closeParts.minute)} onChange={(minute) => setTime('close', closeParts.hour, minute)} ariaLabel="Хвилини зачинення" />
            </div>
          </section>
        </div>
        <div className="time-range-picker__presets" aria-label="Швидкий вибір часу">
          {presets.map((preset) => {
            const label = `${preset.open} – ${preset.close}`;
            const active = preset.open === draft.open && preset.close === draft.close;
            return <button className={active ? 'active' : ''} type="button" key={label} onClick={() => setDraft(preset)}>{label}</button>;
          })}
        </div>
        <footer className="date-time-picker__footer">
          <button className="button button--secondary button--small" type="button" onClick={() => setOpen(false)}>Скасувати</button>
          <button className="button button--primary button--small" type="button" onClick={apply}>Готово</button>
        </footer>
      </section>
    </div>}
  </div>;
}
