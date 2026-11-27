"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { Button, IconButton } from "./components";

export type DatePickerProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
  min?: string;
  max?: string;
  className?: string;
};

type CalendarDate = { year: number; month: number; day: number };

const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const monthGenitives = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const weekdayNames = ["Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота", "Неділя"];
const firstDate = { year: 1, month: 1, day: 1 };
const lastDate = { year: 9999, month: 12, day: 31 };

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDate(value: string | undefined): CalendarDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function isoDate(date: CalendarDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dateName(date: CalendarDate) {
  return `${date.day} ${monthGenitives[date.month - 1]} ${date.year} року`;
}

function todayDate(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

// UTC is used only for calendar arithmetic; the user's "today" is their local date.
// setUTCFullYear also avoids Date's special 1900 offset for years below 100.
function utcDate(date: CalendarDate) {
  const result = new Date(0);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCFullYear(date.year, date.month - 1, date.day);
  return result;
}

function shiftDays(date: CalendarDate, amount: number): CalendarDate {
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

function shiftMonths(date: CalendarDate, amount: number): CalendarDate {
  const monthIndex = (date.year - 1) * 12 + date.month - 1 + amount;
  const boundedIndex = Math.max(0, Math.min(9999 * 12 - 1, monthIndex));
  const year = Math.floor(boundedIndex / 12) + 1;
  const month = boundedIndex % 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function clampDate(date: CalendarDate, min: CalendarDate, max: CalendarDate) {
  if (date.year < 1) return min;
  if (date.year > 9999) return max;
  const iso = isoDate(date);
  return iso < isoDate(min) ? min : iso > isoDate(max) ? max : date;
}

function mondayIndex(date: CalendarDate) {
  return (utcDate(date).getUTCDay() + 6) % 7;
}

export function DatePicker({ label, value, defaultValue = "", onValueChange, disabled = false, error, hint, min, max, className }: DatePickerProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const [localValue, setLocalValue] = useState(defaultValue);
  const currentValue = value === undefined ? localValue : value;
  const selectedDate = parseDate(currentValue);
  const minimum = parseDate(min) ?? firstDate;
  const maximum = parseDate(max) ?? lastDate;
  const minIso = isoDate(minimum);
  const maxIso = isoDate(maximum);
  const invalidBounds = (!!min && !parseDate(min)) || (!!max && !parseDate(max)) || minIso > maxIso;
  const currentBounds = JSON.stringify([min ?? "", max ?? ""]);
  const [previousBounds, setPreviousBounds] = useState(currentBounds);
  const committedBounds = useRef(currentBounds);
  const [open, setOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState(() => clampDate(selectedDate ?? todayDate(), minimum, maximum));
  const [viewDate, setViewDate] = useState(focusedDate);
  // Reconcile before rendering the grid so changed bounds never leave its only
  // tabbable day in another month. The selected value remains the caller's value.
  if (previousBounds !== currentBounds) {
    const nextFocus = clampDate(focusedDate, minimum, maximum);
    setPreviousBounds(currentBounds);
    setFocusedDate(nextFocus);
    setViewDate(nextFocus);
  }
  const today = todayDate();
  const todayIso = isoDate(today);
  const selectedIso = selectedDate ? isoDate(selectedDate) : "";
  const internalError = invalidBounds ? "Перевірте межі календаря: потрібні коректні дати min і max." :
    currentValue && !selectedDate ? "Дата має бути коректною й у форматі YYYY-MM-DD." :
      selectedDate && (selectedIso < minIso || selectedIso > maxIso) ? "Обрана дата поза дозволеним діапазоном." : undefined;
  const validationError = error || internalError;
  const descriptionIds = [hint && `${id}-hint`, validationError && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const monthStart = { ...viewDate, day: 1 };
  const gridStart = shiftDays(monthStart, -mondayIndex(monthStart));
  const dates = Array.from({ length: 42 }, (_, index) => shiftDays(gridStart, index));
  const focusedIso = isoDate(clampDate(focusedDate, minimum, maximum));

  useLayoutEffect(() => {
    const boundsChanged = committedBounds.current !== currentBounds;
    committedBounds.current = currentBounds;
    const target = boundsChanged ? focusedIso : pendingFocus.current;
    pendingFocus.current = null;
    if (open && !disabled && !invalidBounds && target) dayRefs.current.get(target)?.focus();
  }, [currentBounds, disabled, focusedIso, invalidBounds, open]);

  function isAvailable(date: CalendarDate) {
    const iso = isoDate(date);
    return !disabled && !invalidBounds && date.year >= 1 && date.year <= 9999 && iso >= minIso && iso <= maxIso;
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen && disabled) return;
    if (nextOpen) {
      const nextFocus = clampDate(selectedDate ?? todayDate(), minimum, maximum);
      setFocusedDate(nextFocus);
      setViewDate(nextFocus);
    }
    setOpen(nextOpen);
  }

  function selectDate(date: CalendarDate | null) {
    if (disabled || (date && !isAvailable(date))) return;
    const nextValue = date ? isoDate(date) : "";
    if (value === undefined) setLocalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  function moveFocus(date: CalendarDate, focusDay = true) {
    if (disabled || invalidBounds) return;
    const nextDate = clampDate(date, minimum, maximum);
    pendingFocus.current = focusDay ? isoDate(nextDate) : null;
    setFocusedDate(nextDate);
    setViewDate(nextDate);
  }

  function canNavigate(amount: number) {
    const next = shiftMonths(viewDate, amount);
    const start = isoDate({ ...next, day: 1 });
    const end = isoDate({ ...next, day: daysInMonth(next.year, next.month) });
    return !invalidBounds && start <= maxIso && end >= minIso && (next.year !== viewDate.year || next.month !== viewDate.month);
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) {
    let nextDate: CalendarDate;
    switch (event.key) {
      case "ArrowLeft": nextDate = shiftDays(date, -1); break;
      case "ArrowRight": nextDate = shiftDays(date, 1); break;
      case "ArrowUp": nextDate = shiftDays(date, -7); break;
      case "ArrowDown": nextDate = shiftDays(date, 7); break;
      case "Home": nextDate = shiftDays(date, -mondayIndex(date)); break;
      case "End": nextDate = shiftDays(date, 6 - mondayIndex(date)); break;
      case "PageUp": nextDate = shiftMonths(date, event.shiftKey ? -12 : -1); break;
      case "PageDown": nextDate = shiftMonths(date, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    moveFocus(nextDate);
  }

  return (
    <div className={["ui-field", "ui-date-field", className].filter(Boolean).join(" ")} data-disabled={disabled || undefined}>
      <label className="ui-label" htmlFor={id}>{label}</label>
      <Popover.Root open={open && !disabled} onOpenChange={changeOpen}>
        <Popover.Trigger id={id} ref={triggerRef} className="ui-input ui-date-trigger" disabled={disabled} aria-label={label} aria-describedby={descriptionIds} aria-invalid={!!validationError || undefined}>
          <span className={selectedDate ? undefined : "ui-date-placeholder"}>{selectedDate ? `${String(selectedDate.day).padStart(2, "0")}.${String(selectedDate.month).padStart(2, "0")}.${String(selectedDate.year).padStart(4, "0")}` : "Оберіть дату"}</span>
          <CalendarDays size={17} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="ui-positioner" sideOffset={8} align="start" collisionPadding={12} collisionAvoidance={{ side: "flip", align: "shift" }}>
            <Popover.Popup className="ui-popup ui-date-calendar" initialFocus={() => dayRefs.current.get(focusedIso) ?? true} finalFocus={true}>
              <div className="ui-date-heading">
                <Popover.Title className="ui-date-title">Календар: {label}</Popover.Title>
                <Popover.Close render={<IconButton variant="ghost" size="sm" label="Закрити календар" icon={<X size={16} />} />} />
              </div>
              <div className="ui-date-navigation">
                <IconButton variant="ghost" size="sm" label="Попередній рік" icon={<ChevronsLeft size={16} />} disabled={!canNavigate(-12)} onClick={() => moveFocus(shiftMonths(focusedDate, -12), false)} />
                <IconButton variant="ghost" size="sm" label="Попередній місяць" icon={<ChevronLeft size={16} />} disabled={!canNavigate(-1)} onClick={() => moveFocus(shiftMonths(focusedDate, -1), false)} />
                <p className="ui-date-month" aria-live="polite">{monthNames[viewDate.month - 1]} {viewDate.year}</p>
                <IconButton variant="ghost" size="sm" label="Наступний місяць" icon={<ChevronRight size={16} />} disabled={!canNavigate(1)} onClick={() => moveFocus(shiftMonths(focusedDate, 1), false)} />
                <IconButton variant="ghost" size="sm" label="Наступний рік" icon={<ChevronsRight size={16} />} disabled={!canNavigate(12)} onClick={() => moveFocus(shiftMonths(focusedDate, 12), false)} />
              </div>
              <div className="ui-date-grid" role="grid" aria-label={`${monthNames[viewDate.month - 1]} ${viewDate.year}`}>
                <div className="ui-date-week" role="row">
                  {weekdays.map((weekday, index) => <span className="ui-date-weekday" role="columnheader" aria-label={weekdayNames[index]} key={weekday}>{weekday}</span>)}
                </div>
                {Array.from({ length: 6 }, (_, week) => <div className="ui-date-week" role="row" key={week}>
                  {dates.slice(week * 7, week * 7 + 7).map((date, column) => {
                    const iso = isoDate(date);
                    const available = isAvailable(date);
                    // Stable cells retain their DOM buttons when the month changes;
                    // Base UI then has no removed focused node to restore elsewhere.
                    return <div role="gridcell" aria-selected={iso === selectedIso} key={column}>
                      <button type="button" className="ui-date-day" ref={(element) => { if (element) dayRefs.current.set(iso, element); else dayRefs.current.delete(iso); }} aria-label={dateName(date)} aria-current={iso === todayIso ? "date" : undefined} data-date-value={iso} data-selected={iso === selectedIso || undefined} data-outside-month={date.month !== viewDate.month || undefined} disabled={!available} tabIndex={available && iso === focusedIso ? 0 : -1} onFocus={() => setFocusedDate(date)} onKeyDown={(event) => onDayKeyDown(event, date)} onClick={() => selectDate(date)}>{date.day}</button>
                    </div>;
                  })}
                </div>)}
              </div>
              <div className="ui-date-actions">
                <Button variant="secondary" size="sm" disabled={!isAvailable(today)} onClick={() => selectDate(today)}>Сьогодні</Button>
                <Button variant="ghost" size="sm" disabled={disabled || !currentValue} onClick={() => selectDate(null)}>Очистити дату</Button>
              </div>
              <Popover.Description className="ui-date-help">Стрілки — день або тиждень. Page Up / Down — місяць, із Shift — рік. Home / End — початок або кінець тижня.</Popover.Description>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {hint && <p className="ui-field-description" id={`${id}-hint`}>{hint}</p>}
      {validationError && <p className="ui-field-description ui-text-danger" id={`${id}-error`} role="alert"><AlertCircle size={13} aria-hidden="true" />{validationError}</p>}
    </div>
  );
}
