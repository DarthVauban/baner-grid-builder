import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { PopupBehavior, PopupCampaignInput, PopupTargeting } from '../../types/popup-banner';
import { Choice, Property } from './BlockInspector';

export function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function CampaignSettings({ input, onChange, promoCode, onChooseCode }: { input: PopupCampaignInput; onChange: (input: PopupCampaignInput) => void; promoCode?: string; onChooseCode: () => void }) {
  const options = useQuery({ queryKey: ['popup-campaign-options'], queryFn: api.popupBanners.options });
  const behavior = (patch: Partial<PopupBehavior>) => onChange({ ...input, behavior: { ...input.behavior, ...patch } });
  const targeting = (patch: Partial<PopupTargeting>) => onChange({ ...input, targeting: { ...input.targeting, ...patch } });
  const number = (key: keyof PopupBehavior, label: string, min: number, max: number, factor = 1) => <Property label={label}><input aria-label={label} type="number" value={Number(input.behavior[key]) / factor} min={min} max={max} onChange={event => { if (event.target.value !== '') behavior({ [key]: Math.round(Math.max(min, Math.min(max, Number(event.target.value))) * factor) }); }} /></Property>;
  return <div className="pb-inspector-content pb-campaign-settings">
    <div className="pb-inspector-title"><small>КАМПАНІЯ</small><h2>Умови показу</h2></div>
    <p className="pb-help">{options.data?.integration?.storeDomain || 'Підключіть магазин у розділі інтеграцій.'}</p>
    {options.error && <p role="alert">{options.error.message}</p>}
    <details className="pb-group" open><summary>Розташування</summary><div>
      <Choice label="Формат показу" value={input.styles.layout} options={ [['modal', 'По центру із затемненням'], ['bottom-sheet', 'Знизу із затемненням'], ['corner', 'Плаваючий банер без затемнення']] } onChange={layout => onChange({ ...input, styles: { ...input.styles, layout } })} />
      {input.styles.layout === 'corner' && <><Choice label="Положення Desktop" value={input.styles.desktopPosition} options={ [['top_left', 'Зверху ліворуч'], ['top_right', 'Зверху праворуч'], ['bottom_left', 'Знизу ліворуч'], ['bottom_right', 'Знизу праворуч']] } onChange={desktopPosition => onChange({ ...input, styles: { ...input.styles, desktopPosition } })} /><Choice label="Положення Mobile" value={input.styles.mobilePosition} options={ [['top', 'Зверху'], ['bottom', 'Знизу']] } onChange={mobilePosition => onChange({ ...input, styles: { ...input.styles, mobilePosition } })} /></>}
      <p className="pb-help">Розмір банера й усі стилі задаються у властивостях кореневого блока.</p>
    </div></details>
    <details className="pb-group" open><summary>Промокод кампанії</summary><div><strong>{promoCode || 'Не вибрано'}</strong><button type="button" onClick={onChooseCode}>Обрати промокод</button>{input.promoCodeId && <button type="button" onClick={() => onChange({ ...input, promoCodeId: null })}>Відв’язати промокод</button>}<p className="pb-help">Для форми виберіть «Видати промокод кампанії». Код надсилається відвідувачу після збереження контакту. Для відкритої пропозиції оберіть джерело «Бібліотека промокодів кампанії» у блоці промокоду.</p></div></details>
    <details className="pb-group" open><summary>Аудиторія</summary><div>
      <Choice label="Де показувати" value={input.targeting.mode} options={ [['all_pages', 'Усі сторінки'], ['all_products', 'Усі товарні сторінки'], ['products', 'Вибрані товари'], ['target_page', 'Конкретна сторінка'], ['rules', 'За правилами каталогу']] } onChange={mode => targeting({ mode })} />
      {input.targeting.mode === 'target_page' && <Property label="URL сторінки"><input aria-label="URL сторінки" value={input.targeting.targetPageUrl} onChange={event => targeting({ targetPageUrl: event.target.value })} /></Property>}
      {input.targeting.mode === 'products' && <Property label="Артикули або точні назви товарів"><textarea aria-label="Артикули або точні назви товарів" value={input.productEntries.join('\n')} placeholder="Кожен товар з нового рядка" onChange={event => onChange({ ...input, productEntries: event.target.value.split('\n') })} /></Property>}
      {input.targeting.mode === 'rules' && <><Choice label="Поєднання правил" value={input.targeting.match} options={ [['all', 'Усі умови'], ['any', 'Будь-яка умова']] } onChange={match => targeting({ match })} />{(['brands', 'stickers', 'categoryIds', 'conditions'] as const).map(key => {
        const items = key === 'brands' || key === 'conditions' ? (options.data?.[key] || []).map(value => ({ id: value, title: value })) : key === 'stickers' ? options.data?.stickers || [] : options.data?.categories || [];
        return <fieldset className="pb-rule-options" key={key}><legend>{{ brands: 'Бренди', stickers: 'Наліпки', categoryIds: 'Категорії', conditions: 'Стан товару' }[key]}</legend>{items.map(item => <label key={item.id}><input type="checkbox" checked={input.targeting[key].includes(item.id)} onChange={event => targeting({ [key]: event.target.checked ? [...input.targeting[key], item.id] : input.targeting[key].filter(value => value !== item.id) })} />{item.title}</label>)}</fieldset>;
      })}<Property label="URL містить — кожен з нового рядка"><textarea aria-label="URL містить — кожен з нового рядка" value={input.targeting.urlContains.join('\n')} onChange={event => targeting({ urlContains: event.target.value.split('\n') })} /></Property></>}
      <Choice label="Пристрої" value={input.behavior.device} options={ [['all', 'Усі'], ['desktop', 'Лише Desktop'], ['mobile', 'Лише Mobile']] } onChange={device => behavior({ device })} />
      <Property label="Пріоритет"><input aria-label="Пріоритет" type="number" min={0} max={1000} value={input.priority} onChange={event => onChange({ ...input, priority: Math.max(0, Math.min(1000, Number(event.target.value))) })} /></Property>
    </div></details>
    <details className="pb-group" open><summary>Момент і частота показу</summary><div>
      <Choice label="Коли показувати" value={input.behavior.trigger} options={ [['delay', 'Через затримку'], ['scroll', 'Після прокручування'], ['inactivity', 'Після бездіяльності'], ['exit_intent', 'Намір вийти зі сторінки']] } onChange={trigger => behavior({ trigger })} />
      {number('delayMs', 'Затримка, секунд', 0, 60, 1000)}
      {input.behavior.trigger === 'scroll' && number('scrollPercent', 'Прокручено, %', 5, 100)}
      {input.behavior.trigger === 'inactivity' && number('inactivitySeconds', 'Бездіяльність, секунд', 1, 300)}
      <Choice label="Частота показу" value={input.behavior.frequency} options={ [['always', 'Кожен перегляд'], ['session', 'Раз за сесію'], ['product', 'Раз на товар'], ['hours', 'Раз на кілька годин'], ['days', 'Раз на кілька днів']] } onChange={frequency => behavior({ frequency })} />
      {input.behavior.frequency === 'hours' && number('cooldownHours', 'Інтервал, годин', 1, 8760)}
      {input.behavior.frequency === 'days' && number('cooldownDays', 'Інтервал, днів', 1, 365)}
      {number('maxShowsPerSession', 'Ліміт за сесію · 0 без ліміту', 0, 20)}
      {number('autoCloseSeconds', 'Автозакриття, секунд · 0 вимкнено', 0, 300)}
    </div></details>
    <details className="pb-group" open><summary>Розклад</summary><div>
      {(['startsAt', 'endsAt'] as const).map(key => <Property key={key} label={key === 'startsAt' ? 'Початок показу' : 'Кінець показу'}><input aria-label={key === 'startsAt' ? 'Початок показу' : 'Кінець показу'} type="datetime-local" value={localDateTime(input[key])} onChange={event => onChange({ ...input, [key]: event.target.value ? new Date(event.target.value).toISOString() : null })} /></Property>)}
      <small>Дати — у часовому поясі цього пристрою.</small>
      <div className="pb-weekdays">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label, index) => <label key={label}><input type="checkbox" disabled={input.behavior.activeWeekdays.length === 1 && input.behavior.activeWeekdays.includes(index + 1)} checked={input.behavior.activeWeekdays.includes(index + 1)} onChange={event => behavior({ activeWeekdays: event.target.checked ? [...input.behavior.activeWeekdays, index + 1].sort() : input.behavior.activeWeekdays.filter(day => day !== index + 1) })} />{label}</label>)}</div>
      <Choice label="Часовий пояс розкладу" value={input.behavior.scheduleTimezone} options={ [['Europe/Kyiv', 'Київ'], ['Europe/Warsaw', 'Варшава'], ['Europe/Berlin', 'Берлін'], ['UTC', 'UTC']] } onChange={scheduleTimezone => behavior({ scheduleTimezone })} />
      {(['dailyStartTime', 'dailyEndTime'] as const).map(key => <Property key={key} label={key === 'dailyStartTime' ? 'Щодня від' : 'Щодня до'}><input aria-label={key === 'dailyStartTime' ? 'Щодня від' : 'Щодня до'} type="time" value={input.behavior[key]} onChange={event => behavior({ [key]: event.target.value })} /></Property>)}
    </div></details>
  </div>;
}
