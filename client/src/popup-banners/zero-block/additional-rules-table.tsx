'use client';

import type { ReactNode } from 'react';
import { CalendarDays, CheckCheck, DoorOpen, Files, Link2, Users, type LucideIcon } from 'lucide-react';
import { Checkbox, DataTable, Field, NumberInput, Select, Switch, TextInput } from './ui/components';
import { TimePicker } from './ui/time-picker';
import type { PopupDocument } from './types';

export type AdditionalRuleKey = 'visitor' | 'utm' | 'pageviews' | 'exit_intent' | 'weekly' | 'suppression';
type RuleRow = { id: AdditionalRuleKey; title: string; summary: string; enabled: boolean; icon: LucideIcon; defaults: Record<string, unknown>; editor: ReactNode };
const weekdays = [
  { value: 1, label: 'Понеділок', short: 'Пн' }, { value: 2, label: 'Вівторок', short: 'Вт' },
  { value: 3, label: 'Середа', short: 'Ср' }, { value: 4, label: 'Четвер', short: 'Чт' },
  { value: 5, label: 'П’ятниця', short: 'Пт' }, { value: 6, label: 'Субота', short: 'Сб' },
  { value: 7, label: 'Неділя', short: 'Нд' },
];
const utmFields = [
  { key: 'utm_source', label: 'Джерело (utm_source)', placeholder: 'Наприклад: instagram' },
  { key: 'utm_medium', label: 'Канал (utm_medium)', placeholder: 'Наприклад: paid_social' },
  { key: 'utm_campaign', label: 'Кампанія (utm_campaign)', placeholder: 'Наприклад: summer_sale' },
];
const actionOptions = [
  { value: 'submit', label: 'Після успішного надсилання форми' },
  { value: 'copy_promo', label: 'Після копіювання промокоду' },
];
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const string = (value: unknown) => typeof value === 'string' ? value : '';

/** Domain composition of the registered shared controls; no separate draft or history. */
export function AdditionalRulesTable({ document, timezone, update, expanded, onExpandedChange }: {
  document: PopupDocument;
  timezone: string;
  update: (next: PopupDocument) => void;
  expanded: AdditionalRuleKey | null;
  onExpandedChange: (next: AdditionalRuleKey | null) => void;
}) {
  const rule = (type: AdditionalRuleKey) => document.rules.rules.find(item => item.type === type);
  const change = (type: AdditionalRuleKey, patch: Record<string, unknown> | null) => {
    const next = structuredClone(document);
    next.rules.rules = next.rules.rules.filter(item => item.type !== type);
    if (patch) next.rules.rules.push({ ...patch, type });
    update(next);
  };
  const visitor = rule('visitor'), utm = rule('utm'), pageviews = rule('pageviews'), exit = rule('exit_intent'), weekly = rule('weekly'), suppression = rule('suppression');
  const params: Record<string, unknown> = utm?.params && typeof utm.params === 'object' && !Array.isArray(utm.params) ? utm.params as Record<string, unknown> : {};
  const configuredParams = utmFields.filter(field => string(params[field.key]).trim());
  const utmError = utm && !configuredParams.length ? 'Вкажіть хоча б один UTM-параметр або вимкніть умову.' : '';
  const days = Array.isArray(weekly?.days) ? weekly.days.filter((day): day is number => typeof day === 'number' && day >= 1 && day <= 7) : [];
  const allDay = weekly?.allDay === true, start = string(weekly?.start), end = string(weekly?.end);
  const weeklyError = weekly ? !days.length ? 'Оберіть хоча б один день тижня.' : !validTime(start) || !validTime(end) ? 'Вкажіть коректний час початку й завершення.' : !allDay && start === end ? 'Час завершення має відрізнятися від початку.' : '' : '';
  const actions = Array.isArray(suppression?.actions) ? suppression.actions.filter((action): action is string => typeof action === 'string') : [];
  const pageMinimum = Number(pageviews?.min);
  const pageError = pageviews && (!Number.isInteger(pageMinimum) || pageMinimum < 1 || pageMinimum > 100) ? 'Вкажіть ціле число від 1 до 100.' : '';
  const patchWeekly = (patch: Record<string, unknown>) => change('weekly', { ...weekly, ...patch });
  const updateDay = (day: number, checked: boolean) => patchWeekly({ days: weekdays.map(item => item.value).filter(value => value === day ? checked : days.includes(value)) });
  const updateAction = (action: string, checked: boolean) => change('suppression', { actions: actionOptions.map(item => item.value).filter(value => value === action ? checked : actions.includes(value)) });
  const weeklySummary = !weekly ? 'Без обмежень' : !days.length ? 'Дні не вибрано' : `${weekdays.filter(day => days.includes(day.value)).map(day => day.short).join(', ')} · ${allDay ? 'Увесь день' : `${start || '—'}–${end || '—'}${validTime(start) && validTime(end) && start > end ? ' наступного дня' : ''}`}`;
  const rows: RuleRow[] = [
    {
      id: 'visitor', title: 'Новий або повторний відвідувач', summary: visitor ? visitor.value === 'returning' ? 'Повторні' : 'Нові' : 'Усі', enabled: !!visitor, icon: Users, defaults: { value: 'new' },
      editor: <div className="builder-rule-fields">
        <Select label="Відвідувачі" value={visitor ? String(visitor.value) : 'all'} options={[{ value: 'all', label: 'Усі' }, { value: 'new', label: 'Нові' }, { value: 'returning', label: 'Повторні' }]} onValueChange={value => change('visitor', value === 'all' ? null : { value })}/>
        <p className="builder-help builder-rule-fields-help">Тип відвідувача визначається в цьому браузері. Новий візит починається після 30 хвилин без активності.</p>
      </div>,
    },
    {
      id: 'utm', title: 'Джерело переходу / UTM', summary: utm ? configuredParams.length ? configuredParams.map(field => `${field.key}=${string(params[field.key]).trim()}`).join(' · ') : 'Не налаштовано' : 'Будь-яке джерело', enabled: !!utm, icon: Link2, defaults: { params: {} },
      editor: utm ? <div className="builder-rule-fields">
        {utmFields.map(field => <Field key={field.key} label={field.label}><TextInput maxLength={200} placeholder={field.placeholder} value={string(params[field.key])} onChange={event => {
          const next = { ...params };
          if (event.target.value) next[field.key] = event.target.value; else delete next[field.key];
          change('utm', { params: next });
        }}/></Field>)}
        <p className="builder-help builder-rule-fields-help">Заповніть потрібні параметри. Усі задані значення мають точно збігтися; регістр враховується. Джерело переходу зберігається протягом візиту.</p>
        {utmError ? <p className="builder-warning builder-rule-fields-help" role="alert">{utmError}</p> : null}
      </div> : null,
    },
    {
      id: 'pageviews', title: 'Кількість переглянутих сторінок', summary: pageviews ? `Щонайменше ${pageMinimum}` : 'Без обмежень', enabled: !!pageviews, icon: Files, defaults: { min: 3 },
      editor: pageviews ? <div className="builder-rule-fields">
        <Field label="Щонайменше сторінок" error={pageError || undefined}><NumberInput min={1} max={100} step={1} value={String(pageviews.min)} onChange={event => change('pageviews', { min: Number(event.target.value) })}/></Field>
        <p className="builder-help builder-rule-fields-help">Різні сторінки поточного візиту. Повторне відкриття тієї самої сторінки не збільшує кількість.</p>
      </div> : null,
    },
    {
      id: 'exit_intent', title: 'Намір залишити сайт', summary: exit ? 'Вихід курсора за верхню межу вікна' : 'Без обмежень', enabled: !!exit, icon: DoorOpen, defaults: {},
      editor: exit ? <p className="builder-help">Показати банер, коли курсор виходить за верхню межу вікна. Правило працює лише на десктопі з мишею; закриття вкладки та навігація залишаються вільними.</p> : null,
    },
    {
      id: 'weekly', title: 'Дні тижня та години', summary: weeklySummary, enabled: !!weekly, icon: CalendarDays, defaults: { days: [1, 2, 3, 4, 5], allDay: false, start: '09:00', end: '18:00' },
      editor: weekly ? <div className="builder-rule-fields">
        <div className="builder-property-stack builder-rule-fields-help"><p className="builder-help">Дні показу</p><div className="builder-property-grid" role="group" aria-label="Дні показу">{weekdays.map(day => <Checkbox key={day.value} label={day.label} checked={days.includes(day.value)} onCheckedChange={checked => updateDay(day.value, checked)}/>)}</div></div>
        <div className="builder-rule-fields-help"><Switch label="Увесь день" checked={allDay} onCheckedChange={checked => patchWeekly({ allDay: checked, ...(checked ? { start: validTime(start) ? start : '09:00', end: validTime(end) ? end : '18:00' } : {}) })}/></div>
        {!allDay ? <><TimePicker label="Початок показу" value={start} onValueChange={value => patchWeekly({ start: value })}/><TimePicker label="Завершення показу" value={end} onValueChange={value => patchWeekly({ end: value })}/></> : null}
        <p className="builder-help builder-rule-fields-help">Часовий пояс магазину: {timezone}. Нічний проміжок належить вибраному дню початку.</p>
        {weeklyError ? <p className="builder-warning builder-rule-fields-help" role="alert">{weeklyError}</p> : null}
      </div> : null,
    },
    {
      id: 'suppression', title: 'Приховування після успішної дії', summary: suppression ? actions.length ? actionOptions.filter(action => actions.includes(action.value)).map(action => action.value === 'submit' ? 'Після заявки' : 'Після копіювання').join(' або ') : 'Дію не вибрано' : 'Без обмежень', enabled: !!suppression, icon: CheckCheck, defaults: { actions: ['submit'] },
      editor: suppression ? <div className="builder-rule-fields">
        <div className="builder-property-stack builder-rule-fields-help" role="group" aria-label="Успішні дії">{actionOptions.map(action => <Checkbox key={action.value} label={action.label} checked={actions.includes(action.value)} onCheckedChange={checked => updateAction(action.value, checked)}/>)}</div>
        <p className="builder-help builder-rule-fields-help">Після будь-якої вибраної успішної дії цей банер більше не відкриватиметься в цьому браузері. Поточний банер залишиться для перегляду результату.</p>
        {!actions.length ? <p className="builder-warning builder-rule-fields-help" role="alert">Оберіть хоча б одну успішну дію.</p> : null}
      </div> : null,
    },
  ];

  return <DataTable variant="settings" caption="Додаткові налаштування показу" rows={rows} rowLabel={row => row.title} columns={[
    { key: 'title', header: 'Умова', render: row => <span className="builder-rule-name"><row.icon size={19} aria-hidden="true"/><strong>{row.title}</strong></span> },
    { key: 'summary', header: 'Поточне значення', render: row => <span className="builder-rule-summary" title={row.summary}>{row.summary}</span> },
    { key: 'enabled', header: 'Стан', render: row => row.id === 'visitor' ? null : <Switch label={<span className="ui-sr-only">{row.title}</span>} checked={row.enabled} onCheckedChange={checked => { change(row.id, checked ? row.defaults : null); if (checked) onExpandedChange(row.id); }}/> },
  ]} expansion={{ ids: expanded ? [expanded] : [], label: row => `Налаштування: ${row.title}`, onToggle: row => onExpandedChange(expanded === row.id ? null : row.id), render: row => row.editor || <p className="builder-help">Увімкніть умову в колонці «Стан», щоб змінити її налаштування.</p> }}/>;
}
