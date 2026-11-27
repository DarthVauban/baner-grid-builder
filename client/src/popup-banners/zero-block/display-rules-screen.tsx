'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowDown, Globe, CalendarDays, Monitor, Repeat2, Timer, type LucideIcon } from 'lucide-react';
import { Button, Card, DataTable, Field, NumberInput, Select, Switch, Tabs, TextArea } from './ui/components';
import { DatePicker } from './ui/date-picker';
import { TimePicker } from './ui/time-picker';
import { wallToUtc } from '@zero/wall-time.mjs';
import { AdditionalRulesTable, type AdditionalRuleKey } from './additional-rules-table';
import type { PopupDocument } from './types';

const clone = <T,>(value: T): T => structuredClone(value);
const number = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const wall = (value: string | null, timezone: string) => {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const plural = (value: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('uk').select(value);
  return `${value} ${form === 'one' ? one : form === 'few' ? few : many}`;
};
type RuleKey = 'url' | 'datetime' | 'device' | 'delay' | 'scroll' | 'frequency';
type RuleRow = { id: RuleKey; title: string; summary: string; enabled: boolean; icon: LucideIcon; editor: ReactNode; defaults: Record<string, unknown> };
const matchesRule = (stored: string, key: RuleKey) => stored === key || key === 'frequency' && ['daily_frequency', 'session_frequency'].includes(stored);
const frequencyPeriods = [{ value: 'day', label: 'На день' }, { value: 'session', label: 'За сесію' }, { value: 'both', label: 'На день і за сесію' }];
const commonTimezones = new Map([['Europe/Kyiv', 'Київ'], ['Europe/Warsaw', 'Варшава'], ['Europe/Berlin', 'Берлін'], ['UTC', 'UTC']]);
const timezones = [...new Set([...commonTimezones.keys(), ...Intl.supportedValuesOf('timeZone')])];
const timezoneOptions = timezones.map((value) => ({ value, label: commonTimezones.has(value) ? commonTimezones.get(value)! + ' · ' + value : value }));
const frequencyError = (value: number | undefined) => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 100) ? 'Вкажіть ціле число від 1 до 100.' : undefined;

export function DisplayRulesScreen({ document, timezone, update, onBack, warning }: { document: PopupDocument; timezone: string; update: (next: PopupDocument) => void; onBack: () => void; warning?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const [expanded, setExpanded] = useState<RuleKey | null>('url');
  const [additionalExpanded, setAdditionalExpanded] = useState<AdditionalRuleKey | null>('visitor');
  const [dateError, setDateError] = useState('');
  const rule = (type: RuleKey) => document.rules.rules.find(item => matchesRule(item.type, type));
  const change = (type: RuleKey, patch: Record<string, unknown> | null, storedType: string = type === 'frequency' ? 'daily_frequency' : type) => {
    const next = clone(document);
    next.rules.rules = next.rules.rules.filter(item => !matchesRule(item.type, type));
    if (patch) next.rules.rules.push({ ...patch, type: storedType });
    update(next);
  };
  const url = rule('url'), datetime = rule('datetime'), device = rule('device'), delay = rule('delay'), scroll = rule('scroll'), frequency = rule('frequency');
  const sessionFrequency = frequency?.type === 'session_frequency' ? frequency : undefined;
  const dailyLimit = sessionFrequency ? sessionFrequency.dailyMax : frequency?.max;
  const dailyMax = dailyLimit === undefined ? undefined : Number(dailyLimit);
  const sessionMax = sessionFrequency ? Number(sessionFrequency.max) : undefined;
  const dayError = frequencyError(dailyMax), sessionError = frequencyError(sessionMax);
  const period = sessionMax === undefined ? 'day' : dailyMax === undefined ? 'session' : 'both';
  const frequencySummary = [
    dailyMax === undefined ? '' : `${plural(dailyMax, 'разу', 'разів', 'разів')} на день`,
    sessionMax === undefined ? '' : `${plural(sessionMax, 'разу', 'разів', 'разів')} за сесію`,
  ].filter(Boolean).join(' · ');
  const changeFrequency = (day: number | undefined, session: number | undefined) => {
    if (session === undefined) change('frequency', { max: day });
    else change('frequency', { max: session, ...(day === undefined ? {} : { dailyMax: day }) }, 'session_frequency');
  };
  const lines = (value: unknown) => Array.isArray(value) ? value.join('\n') : '';
  const split = (value: string) => value.split('\n').map(part => part.trim()).filter(Boolean);
  const dateChange = (current: unknown, date: string, time: string) => {
    try { const result = date ? wallToUtc(`${date}T${time || '00:00'}`, timezone) : null; setDateError(''); return result; }
    catch (error) { setDateError(error instanceof Error ? error.message : 'Некоректні дата або час'); return current; }
  };
  const startWall = wall(datetime?.start as string | null, timezone), endWall = wall(datetime?.end as string | null, timezone);
  const today = () => wall(new Date().toISOString(), timezone).slice(0, 10);
  const dateLabel = (value: unknown) => new Intl.DateTimeFormat('uk-UA', { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));
  const paths = (value: unknown) => Array.isArray(value) ? value.map(String).join(', ') : '';
  const urlSummary = url ? `${paths(url.include) ? `Лише ${paths(url.include)}` : 'Усі сторінки'}${paths(url.exclude) ? ` · Крім ${paths(url.exclude)}` : ''}` : 'Усі сторінки';
  const dateSummary = datetime?.start && datetime?.end ? `${dateLabel(datetime.start)} — ${dateLabel(datetime.end)}` : datetime?.start ? `Від ${dateLabel(datetime.start)}` : datetime?.end ? `До ${dateLabel(datetime.end)}` : 'Без обмежень';
  const rows: RuleRow[] = [
    { id: 'url', title: 'Сторінки / URL', summary: urlSummary, enabled: !!url, icon: Globe, defaults: { include: [], exclude: [] }, editor: url ? <div className="builder-rule-fields">
      <Field label="Включити шляхи"><TextArea rows={2} value={lines(url.include)} onChange={event => change('url', { ...url, include: split(event.target.value) })}/></Field>
      <Field label="Виключити шляхи"><TextArea rows={2} value={lines(url.exclude)} onChange={event => change('url', { ...url, exclude: split(event.target.value) })}/></Field>
      <p className="builder-help builder-rule-fields-help">Кожен шлях з нового рядка. Шлях /sale/ також охоплює його підсторінки.</p>
    </div> : null },
    { id: 'datetime', title: 'Дата й час', summary: dateSummary, enabled: !!datetime, icon: CalendarDays, defaults: { start: null, end: null }, editor: datetime ? <div className="builder-rule-fields">
      <div className="builder-date-time-pair">
        <DatePicker label="Початок: дата" value={startWall.slice(0, 10)} onValueChange={value => change('datetime', { ...datetime, start: dateChange(datetime.start, value, startWall.slice(11)) })}/>
        <TimePicker label="Початок: час" value={startWall.slice(11)} onValueChange={value => change('datetime', { ...datetime, start: dateChange(datetime.start, startWall.slice(0, 10) || today(), value) })}/>
      </div>
      <div className="builder-date-time-pair">
        <DatePicker label="Завершення: дата" value={endWall.slice(0, 10)} onValueChange={value => change('datetime', { ...datetime, end: dateChange(datetime.end, value, endWall.slice(11) || '23:59') })}/>
        <TimePicker label="Завершення: час" value={endWall.slice(11)} onValueChange={value => change('datetime', { ...datetime, end: dateChange(datetime.end, endWall.slice(0, 10) || today(), value || '23:59') })}/>
      </div>
      <p className="builder-help builder-rule-fields-help">Дата й час у часовому поясі магазину: {timezone}.</p>
      {dateError ? <p role="alert" className="builder-warning builder-rule-fields-help">{dateError}</p> : null}
    </div> : null },
    { id: 'device', title: 'Тип пристрою', summary: device ? device.value === 'mobile' ? 'Мобільні' : 'Десктоп' : 'Усі пристрої', enabled: !!device, icon: Monitor, defaults: { value: 'desktop' }, editor: <div className="builder-rule-fields"><Select label="Пристрій" options={[{ value: 'all', label: 'Усі пристрої' }, { value: 'desktop', label: 'Десктоп' }, { value: 'mobile', label: 'Мобільні' }]} value={device ? String(device.value) : 'all'} onValueChange={value => change('device', value === 'all' ? null : { value })}/></div> },
    { id: 'delay', title: 'Затримка', summary: delay ? plural(Number(delay.seconds), 'секунда', 'секунди', 'секунд') : 'Без затримки', enabled: !!delay, icon: Timer, defaults: { seconds: 0 }, editor: delay ? <div className="builder-rule-fields"><Field label="Секунди (0–3600)"><NumberInput min={0} max={3600} value={String(delay.seconds)} onChange={event => change('delay', { seconds: number(event.target.value, 0) })}/></Field></div> : null },
    { id: 'scroll', title: 'Глибина прокрутки', summary: scroll ? `${scroll.percent}% сторінки` : 'Без обмежень', enabled: !!scroll, icon: ArrowDown, defaults: { percent: 50 }, editor: scroll ? <div className="builder-rule-fields"><Field label="Відсоток (0–100)"><NumberInput min={0} max={100} value={String(scroll.percent)} onChange={event => change('scroll', { percent: number(event.target.value, 50) })}/></Field></div> : null },
    { id: 'frequency', title: 'Частота показу', summary: dayError || sessionError ? 'Не налаштовано' : frequencySummary ? `Не більше ${frequencySummary}` : 'Без обмежень', enabled: !!frequency, icon: Repeat2, defaults: { max: 1 }, editor: frequency ? <div className="builder-rule-fields">
      <Select className="builder-rule-fields-help" label="Період обмеження" options={frequencyPeriods} value={period} onValueChange={value => changeFrequency(value === 'session' ? undefined : dailyMax ?? 1, value === 'day' ? undefined : sessionMax ?? 1)}/>
      {dailyMax !== undefined ? <Field label="Ліміт показів на день" error={dayError}><NumberInput min={1} max={100} step={1} value={String(dailyMax)} onChange={event => changeFrequency(Number(event.target.value), sessionMax)}/></Field> : null}
      {sessionMax !== undefined ? <Field label="Ліміт показів за сесію" error={sessionError}><NumberInput min={1} max={100} step={1} value={String(sessionMax)} onChange={event => changeFrequency(dailyMax, Number(event.target.value))}/></Field> : null}
      <p className="builder-help builder-rule-fields-help">Для цього банера в цьому браузері.{dailyMax !== undefined ? ` ${sessionMax === undefined ? 'Ліміт' : 'Денний ліміт'} скидається опівночі (${timezone}).` : ''}{sessionMax !== undefined ? ' Нова сесія починається після 30 хвилин бездіяльності.' : ''}</p>
    </div> : null },
  ];
  const activeCount = document.rules.rules.length;
  const table = <DataTable variant="settings" caption="Базові налаштування показу" rows={rows} rowLabel={row => row.title} columns={[
    { key: 'title', header: 'Умова', render: row => <span className="builder-rule-name"><row.icon size={19} aria-hidden="true"/><strong>{row.title}</strong></span> },
    { key: 'summary', header: 'Поточне значення', render: row => <span className="builder-rule-summary" title={row.summary}>{row.summary}</span> },
    { key: 'enabled', header: 'Стан', render: row => row.id === 'device' ? null : <Switch label={<span className="ui-sr-only">{row.id === 'frequency' ? 'Частота повторного показу' : row.title}</span>} checked={row.enabled} onCheckedChange={checked => { change(row.id, checked ? row.defaults : null); if (checked) setExpanded(row.id); }}/> },
  ]} expansion={{ ids: expanded ? [expanded] : [], onToggle: row => setExpanded(current => current === row.id ? null : row.id), label: row => `Налаштування: ${row.title}`, render: row => row.editor || <p className="builder-help">Увімкніть умову в колонці «Стан», щоб змінити її налаштування.</p> }}/>;
  return <section className="builder-rules-screen" aria-labelledby="builder-rules-heading">
    <div className="builder-rules-scroll"><div className="builder-rules-content">
      <div className="builder-rules-heading">
        <div className="builder-rules-title"><Button variant="secondary" icon={<ArrowLeft size={17}/>} onClick={onBack}>До дизайну</Button><div><h1 id="builder-rules-heading" ref={heading} tabIndex={-1}>Налаштування показу</h1><p className="builder-help">Визначте, де й коли показувати банер.</p></div></div>
        <div className="builder-rules-utilities"><div className="builder-rules-priority"><Field label="Пріоритет" hint="0–100"><NumberInput min={0} max={100} value={String(document.priority)} onChange={event => { const next = clone(document); next.priority = number(event.target.value, next.priority); update(next); }}/></Field></div>
          <Select label="Часовий пояс" value={timezone} searchable
            options={timezones.includes(timezone) ? timezoneOptions : [...timezoneOptions, { value: timezone, label: timezone }]}
            onValueChange={(value) => { setDateError(''); update({ ...clone(document), timezone: value }); }} />
        </div>
      </div>
      <Tabs label="Розділи налаштувань показу" defaultValue="basic" items={[
        { value: 'basic', label: 'Базові налаштування', content: table },
        { value: 'additional', label: 'Додаткові правила', content: <AdditionalRulesTable document={document} timezone={timezone} update={update} expanded={additionalExpanded} onExpandedChange={setAdditionalExpanded}/> },
      ]}/>
      <Card tone="dark" padding="none"><div className="builder-rules-summary" role="status"><strong>Активні умови: {activeCount}</strong><p>{activeCount ? 'Усі ввімкнені умови мають виконатися.' : 'Показ без додаткових обмежень.'}</p></div></Card>
      <p className="builder-help">Налаштування спільні для комп’ютера й телефона.</p>
    </div></div>
    {warning ? <div className="builder-rules-warning">{warning}</div> : null}
  </section>;
}
