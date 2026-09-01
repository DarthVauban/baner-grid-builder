import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopTitleLabelRule } from '../types/horoshop-title-labels';
import '../styles/horoshop-title-labels.css';

function formatDate(value: string | null) {
  if (!value) return 'Ще не публікувалося';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return '00000000-0000-4000-8000-'.concat(Date.now().toString().padStart(12, '0').slice(-12));
}

function emptyRule(): HoroshopTitleLabelRule {
  return {
    id: newId(),
    name: 'Новий лейбл',
    text: 'Вживаний',
    stickerKeys: [],
    backgroundColor: '#202020',
    textColor: '#ffe101',
    borderColor: '#202020',
    borderRadius: 4,
    productPageFontSize: 18,
    productCardFontSize: 12,
    cartFontSize: 13,
    enabled: true
  };
}

function clampFontSize(value: number) {
  return Math.max(8, Math.min(32, Math.round(value)));
}

function previewStyle(rule: HoroshopTitleLabelRule) {
  return {
    '--label-background': rule.backgroundColor,
    '--label-color': rule.textColor,
    '--label-border': rule.borderColor,
    '--label-radius': `${rule.borderRadius}px`
  } as CSSProperties;
}

export function HoroshopTitleLabelsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const settingsQuery = useQuery({
    queryKey: ['horoshop-title-labels-settings'],
    queryFn: api.horoshopTitleLabels.settings
  });
  const [rules, setRules] = useState<HoroshopTitleLabelRule[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [stickerSearch, setStickerSearch] = useState('');
  const saveDraft = useMutation({ mutationFn: api.horoshopTitleLabels.saveDraft });
  const publish = useMutation({ mutationFn: api.horoshopTitleLabels.publish });
  const setEnabled = useMutation({ mutationFn: api.horoshopTitleLabels.setEnabled });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setRules(settingsQuery.data.draftRules);
    setSelectedId((current) => settingsQuery.data?.draftRules.some((rule) => rule.id === current)
      ? current
      : settingsQuery.data?.draftRules[0]?.id || '');
  }, [settingsQuery.data]);

  const selectedIndex = rules.findIndex((rule) => rule.id === selectedId);
  const selected = selectedIndex >= 0 ? rules[selectedIndex] : null;
  const filteredStickers = useMemo(() => {
    const search = stickerSearch.trim().toLocaleLowerCase('uk-UA');
    return (settingsQuery.data?.stickerOptions || []).filter((sticker) => !search
      || sticker.title.toLocaleLowerCase('uk-UA').includes(search)
      || sticker.id.toLocaleLowerCase('uk-UA').includes(search));
  }, [settingsQuery.data?.stickerOptions, stickerSearch]);
  const dirty = Boolean(settingsQuery.data) && JSON.stringify(rules) !== JSON.stringify(settingsQuery.data?.draftRules);
  const busy = saveDraft.isPending || publish.isPending || setEnabled.isPending;

  if (settingsQuery.isLoading) return <div className="title-label-tool-state">Завантажуємо конструктор лейблів…</div>;
  if (settingsQuery.isError || !settingsQuery.data) return <div className="title-label-tool-state is-error">Не вдалося завантажити конструктор лейблів.</div>;

  const settings = settingsQuery.data;

  function updateSelected(patch: Partial<HoroshopTitleLabelRule>) {
    setRules((current) => current.map((rule) => rule.id === selectedId ? { ...rule, ...patch } : rule));
  }

  function addRule() {
    const rule = emptyRule();
    setRules((current) => [...current, rule]);
    setSelectedId(rule.id);
  }

  function moveSelected(direction: -1 | 1) {
    const target = selectedIndex + direction;
    if (selectedIndex < 0 || target < 0 || target >= rules.length) return;
    setRules((current) => {
      const next = [...current];
      [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
      return next;
    });
  }

  async function removeSelected() {
    if (!selected || !await confirm({
      title: 'Видалити лейбл?',
      message: `Правило «${selected.name}» буде видалено з чернетки. На сайті зміни зʼявляться лише після публікації.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    const next = rules.filter((rule) => rule.id !== selected.id);
    setRules(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id || '');
  }

  function toggleSticker(key: string) {
    if (!selected) return;
    const stickerKeys = selected.stickerKeys.includes(key)
      ? selected.stickerKeys.filter((item) => item !== key)
      : [...selected.stickerKeys, key];
    updateSelected({ stickerKeys });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['horoshop-title-labels-settings'] });
  }

  async function save() {
    try {
      await saveDraft.mutateAsync(rules);
      await refresh();
      showToast('Чернетку лейблів збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти чернетку.', 'error');
    }
  }

  async function publishRules() {
    try {
      await publish.mutateAsync(rules);
      await refresh();
      showToast('Лейбли опубліковано й увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати лейбли.', 'error');
    }
  }

  async function toggleEnabled() {
    try {
      await setEnabled.mutateAsync(!settings.enabled);
      await refresh();
      showToast(settings.enabled ? 'Лейбли на вітрині вимкнено.' : 'Опубліковані лейбли увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити стан лейблів.', 'error');
    }
  }

  async function copyEmbedCode() {
    try {
      await navigator.clipboard.writeText(settings.embedCode);
      showToast('Асинхронний код скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  return <div className="title-label-tool-page">
    <header className="title-label-tool-heading">
      <div>
        <p className="eyebrow">Хорошоп · назви товарів</p>
        <h1>Лейбли товарів</h1>
        <p>Створюйте акуратні текстові лейбли й привʼязуйте кожен до одного або кількох стікерів Хорошопа. Одне правило працює на сторінці товару, у картках вітрини та в кошику.</p>
      </div>
      <div className="title-label-heading-actions">
        <div className={`title-label-status${settings.enabled ? ' is-active' : ''}`}><span /><div><strong>{settings.enabled ? 'Лейбли активні' : 'Лейбли вимкнені'}</strong><small>{settings.storeDomain || 'Магазин не підключено'}</small></div></div>
        <div className="title-label-primary-actions">
          <button className="button button--secondary" type="button" disabled={!dirty || busy} onClick={() => void save()}><Icon name="save" size={17} /> Зберегти</button>
          <button className="button button--primary" type="button" disabled={busy || rules.length === 0} onClick={() => void publishRules()}><Icon name="publication" size={17} /> Опублікувати</button>
        </div>
      </div>
    </header>

    <section className="title-label-workspace">
      <aside className="title-label-library">
        <header><div><p className="eyebrow">Правила</p><h2>Лейбли</h2></div><button type="button" onClick={addRule} aria-label="Додати лейбл"><Icon name="add" size={19} /></button></header>
        <p className="title-label-priority-note"><Icon name="arrowDown" size={16} /> Якщо товар має кілька стікерів, усі відповідні активні лейбли показуються у порядку цього списку.</p>
        <div className="title-label-rule-list">
          {rules.map((rule, index) => <button className={`title-label-rule${rule.id === selectedId ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedId(rule.id)} key={rule.id}>
            <span className="title-label-rule__swatch" style={{ background: rule.backgroundColor, color: rule.textColor }}>{rule.text.slice(0, 2)}</span>
            <span><strong>{rule.name}</strong><small>{rule.stickerKeys.length ? `${rule.stickerKeys.length} стікерів` : 'Стікери не вибрані'}</small></span>
            <em>{index + 1}</em>
          </button>)}
        </div>
        {!rules.length && <div className="title-label-empty"><Icon name="productCard" size={28} /><strong>Ще немає лейблів</strong><p>Створіть перше правило й виберіть стікери каталогу.</p><button className="button button--primary" type="button" onClick={addRule}>Створити лейбл</button></div>}
      </aside>

      <div className="title-label-editor">
        {selected ? <>
          <header className="title-label-editor-heading">
            <div><p className="eyebrow">Редагування</p><h2>{selected.name || 'Без назви'}</h2></div>
            <div className="title-label-rule-actions">
              <button type="button" onClick={() => moveSelected(-1)} disabled={selectedIndex === 0} aria-label="Підняти лейбл"><Icon name="arrowUp" size={18} /></button>
              <button type="button" onClick={() => moveSelected(1)} disabled={selectedIndex === rules.length - 1} aria-label="Опустити лейбл"><Icon name="arrowDown" size={18} /></button>
              <button className="is-danger" type="button" onClick={() => void removeSelected()} aria-label="Видалити лейбл"><Icon name="delete" size={18} /></button>
            </div>
          </header>

          <div className="title-label-preview" style={previewStyle(selected)}>
            <p className="eyebrow">Попередній перегляд</p>
            <div className="title-label-preview__examples">
              <div><small><Icon name="productPage" size={14} /> Сторінка товару · {selected.productPageFontSize}px</small><p className="title-label-preview__product"><span style={{ fontSize: `${selected.productPageFontSize}px` }}>{selected.text || 'Лейбл'}</span><strong>Смартфон Apple iPhone 13 128Gb Midnight</strong></p></div>
              <div><small><Icon name="productCard" size={14} /> Картка товару · {selected.productCardFontSize}px</small><p className="title-label-preview__card"><span style={{ fontSize: `${selected.productCardFontSize}px` }}>{selected.text || 'Лейбл'}</span><strong>Смартфон Apple iPhone 13</strong></p></div>
              <div><small><Icon name="storefront" size={14} /> Кошик · {selected.cartFontSize}px</small><p className="title-label-preview__cart"><span style={{ fontSize: `${selected.cartFontSize}px` }}>{selected.text || 'Лейбл'}</span><strong>Смартфон Apple iPhone 13 128Gb</strong></p></div>
            </div>
          </div>

          <div className="title-label-form-section">
            <header><div><h3>Текст і стиль</h3><p>Короткий текст краще читається у компактній картці та в рядку кошика.</p></div><label className="title-label-switch"><input type="checkbox" checked={selected.enabled} onChange={(event) => updateSelected({ enabled: event.target.checked })} /><span /> Активний</label></header>
            <div className="title-label-fields">
              <label>Назва правила<input aria-label="Назва правила" value={selected.name} maxLength={60} onChange={(event) => updateSelected({ name: event.target.value })} /></label>
              <label>Текст лейбла<input aria-label="Текст лейбла" value={selected.text} maxLength={30} onChange={(event) => updateSelected({ text: event.target.value })} /></label>
              <label className="title-label-color-field">Фон<span><input aria-label="Колір фону" type="color" value={selected.backgroundColor} onChange={(event) => updateSelected({ backgroundColor: event.target.value })} /><code>{selected.backgroundColor}</code></span></label>
              <label className="title-label-color-field">Текст<span><input aria-label="Колір тексту" type="color" value={selected.textColor} onChange={(event) => updateSelected({ textColor: event.target.value })} /><code>{selected.textColor}</code></span></label>
              <label className="title-label-color-field">Обводка<span><input aria-label="Колір обводки" type="color" value={selected.borderColor} onChange={(event) => updateSelected({ borderColor: event.target.value })} /><code>{selected.borderColor}</code></span></label>
              <label>Заокруглення, px<input aria-label="Заокруглення" type="number" min={0} max={20} value={selected.borderRadius} onChange={(event) => updateSelected({ borderRadius: Math.max(0, Math.min(20, Number(event.target.value) || 0)) })} /></label>
            </div>
            <div className="title-label-font-settings">
              <div className="title-label-font-settings__heading"><strong>Розмір тексту лейбла</strong><span>Налаштовується окремо для кожного місця показу · 8–32 px</span></div>
              <div className="title-label-font-settings__grid">
                <label><span><Icon name="productPage" size={16} /><span><strong>Сторінка товару</strong><small>У заголовку товару</small></span></span><span className="title-label-font-settings__input"><input aria-label="Розмір шрифту на сторінці товару" type="number" min={8} max={32} value={selected.productPageFontSize} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && updateSelected({ productPageFontSize: clampFontSize(event.target.valueAsNumber) })} /><em>px</em></span></label>
                <label><span><Icon name="productCard" size={16} /><span><strong>Картка товару</strong><small>Каталог і слайдери</small></span></span><span className="title-label-font-settings__input"><input aria-label="Розмір шрифту у картці товару" type="number" min={8} max={32} value={selected.productCardFontSize} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && updateSelected({ productCardFontSize: clampFontSize(event.target.valueAsNumber) })} /><em>px</em></span></label>
                <label><span><Icon name="storefront" size={16} /><span><strong>Кошик</strong><small>Рядок товару в кошику</small></span></span><span className="title-label-font-settings__input"><input aria-label="Розмір шрифту у кошику" type="number" min={8} max={32} value={selected.cartFontSize} onChange={(event) => Number.isFinite(event.target.valueAsNumber) && updateSelected({ cartFontSize: clampFontSize(event.target.valueAsNumber) })} /><em>px</em></span></label>
              </div>
            </div>
          </div>

          <div className="title-label-form-section title-label-sticker-section">
            <header><div><h3>Стікери Хорошопа</h3><p>Один лейбл можна привʼязати до кількох стікерів. Нові товари після синхронізації підхопляться автоматично.</p></div><strong>{selected.stickerKeys.length} вибрано</strong></header>
            <div className="title-label-sticker-search"><Icon name="search" size={18} /><input aria-label="Пошук стікерів" placeholder="Назва або ID стікера" value={stickerSearch} onChange={(event) => setStickerSearch(event.target.value)} /></div>
            <div className="title-label-sticker-grid">
              {filteredStickers.map((sticker) => <label className={selected.stickerKeys.includes(sticker.key) ? 'is-selected' : ''} key={sticker.key}>
                <input type="checkbox" checked={selected.stickerKeys.includes(sticker.key)} onChange={() => toggleSticker(sticker.key)} />
                <span><strong>{sticker.title}</strong><small>{sticker.id ? `ID ${sticker.id} · ` : ''}{sticker.productCount} товарів</small></span>
                <i><Icon name="check" size={14} /></i>
              </label>)}
              {!filteredStickers.length && <div className="title-label-no-stickers"><Icon name="search" size={24} /><strong>Стікерів не знайдено</strong><p>{settings.stickerOptions.length ? 'Спробуйте інший запит.' : 'Запустіть синхронізацію каталогу Хорошопа.'}</p></div>}
            </div>
          </div>
        </> : <div className="title-label-editor-empty"><Icon name="productCard" size={42} /><h2>Оберіть або створіть лейбл</h2><p>Тут зʼявляться стиль, привʼязки до стікерів і живий preview.</p></div>}
      </div>
    </section>

    <div className="title-label-bottom-grid">
      <section className="title-label-bottom-card">
        <header><div><p className="eyebrow">Встановлення</p><h2>Один асинхронний код</h2></div><Icon name="link" size={22} /></header>
        <p>Додайте код у глобальний шаблон Хорошопа перед <code>&lt;/body&gt;</code>. Він містить окремі адаптери для desktop і mobile та не змінює нативні посилання товарів. Попередній кастомний код лейбла потрібно прибрати, щоб не створювати дублікати.</p>
        <pre>{settings.embedCode}</pre>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbedCode()}><Icon name="copy" size={16} /> Копіювати код</button>
      </section>
      <section className="title-label-bottom-card">
        <header><div><p className="eyebrow">Публікація</p><h2>Стан на сайті</h2></div><span className={settings.enabled ? 'is-live' : ''}>{settings.enabled ? 'Активно' : 'Вимкнено'}</span></header>
        <dl><div><dt>Опублікована версія</dt><dd>{settings.publishedVersion || '—'}</dd></div><div><dt>Остання публікація</dt><dd>{formatDate(settings.publishedAt)}</dd></div><div><dt>Синхронізація каталогу</dt><dd>{formatDate(settings.lastCatalogSyncAt)}</dd></div></dl>
        <button className="title-label-enable-button" type="button" disabled={!settings.publishedVersion || busy} onClick={() => void toggleEnabled()}>{settings.enabled ? 'Тимчасово вимкнути лейбли' : 'Увімкнути опубліковані лейбли'}</button>
      </section>
    </div>
  </div>;
}
