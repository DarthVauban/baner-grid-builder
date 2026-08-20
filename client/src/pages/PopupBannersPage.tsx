import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  PopupCampaign,
  PopupCampaignInput,
  PopupCampaignStatus,
  PopupTargeting
} from '../types/popup-banner';
import '../styles/popup-banners.css';

type EditorTab = 'content' | 'targeting' | 'behavior';

const statusLabels: Record<PopupCampaignStatus, string> = {
  draft: 'Чернетка',
  active: 'Активна',
  paused: 'Призупинена'
};

function emptyCampaign(): PopupCampaignInput {
  return {
    name: 'Попередження про товар',
    priority: 100,
    content: {
      eyebrow: 'Важлива інформація',
      title: 'Зверніть увагу',
      body: 'Перед оформленням замовлення ознайомтеся з важливою інформацією про товар.',
      primaryLabel: 'Зрозуміло',
      primaryUrl: '',
      secondaryLabel: 'Закрити',
      imageUrl: '',
      acknowledgementLabel: 'Я прочитав(-ла) і розумію цю інформацію.'
    },
    styles: {
      layout: 'modal',
      accentColor: '#6d5dfc',
      backgroundColor: '#ffffff',
      textColor: '#172033',
      mutedColor: '#667085',
      borderRadius: 24,
      maxWidth: 520
    },
    targeting: {
      mode: 'products',
      match: 'all',
      stickers: [],
      brands: [],
      categoryIds: [],
      conditions: [],
      urlContains: []
    },
    behavior: {
      delayMs: 300,
      frequency: 'product',
      cooldownDays: 7,
      dismissible: true,
      requireAcknowledgement: false
    },
    startsAt: null,
    endsAt: null,
    productEntries: []
  };
}

function campaignInput(campaign: PopupCampaign): PopupCampaignInput {
  return {
    name: campaign.name,
    priority: campaign.priority,
    content: { ...campaign.content },
    styles: { ...campaign.styles },
    targeting: { ...campaign.targeting },
    behavior: { ...campaign.behavior },
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    productEntries: campaign.productTargets.map((item) => item.sku)
  };
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function inputLines(value: string) {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Без обмеження';
}

function Toggle({ checked, label, description, onChange }: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className="popup-toggle">
    <span><strong>{label}</strong><small>{description}</small></span>
    <input className="switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function RulePicker({ label, values, selected, options, onChange }: {
  label: string;
  values: string[];
  selected: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return <div className="popup-rule-picker">
    <span className="field-label">{label}</span>
    <StyledSelect
      value={selected}
      options={[{ value: '', label: `Додати: ${label.toLocaleLowerCase('uk-UA')}` }, ...options.filter((item) => !values.includes(item.value))]}
      onChange={onChange}
      searchable
      searchPlaceholder={`Пошук: ${label.toLocaleLowerCase('uk-UA')}`}
      ariaLabel={label}
    />
    {values.length > 0 && <div className="popup-rule-chips">
      {values.map((value) => <button type="button" key={value} onClick={() => onChange(value)}>
        {options.find((item) => item.value === value)?.label || value}<Icon name="close" size={13} />
      </button>)}
    </div>}
  </div>;
}

function Preview({ draft }: { draft: PopupCampaignInput }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const content = draft.content;
  const styles = draft.styles;
  return <div className={`popup-preview is-${styles.layout}`} style={{
    '--preview-accent': styles.accentColor,
    '--preview-bg': styles.backgroundColor,
    '--preview-text': styles.textColor,
    '--preview-muted': styles.mutedColor,
    '--preview-radius': `${styles.borderRadius}px`,
    '--preview-width': `${Math.min(styles.maxWidth, 520)}px`
  } as CSSProperties}>
    <div className="popup-preview__browser"><span /><span /><span /><small>Попередній перегляд</small></div>
    <div className="popup-preview__stage">
      <article className="popup-preview__card">
        {styles.layout !== 'corner' && draft.behavior.dismissible && <span className="popup-preview__close">×</span>}
        {content.imageUrl && <img src={content.imageUrl} alt="" />}
        <div className="popup-preview__content">
          {content.eyebrow && <p>{content.eyebrow}</p>}
          <h3>{content.title || 'Заголовок попапа'}</h3>
          <div>{content.body || 'Текст попапа'}</div>
          {draft.behavior.requireAcknowledgement && <label>
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>{content.acknowledgementLabel}</span>
          </label>}
          <footer>
            {draft.behavior.dismissible && content.secondaryLabel && <button type="button">{content.secondaryLabel}</button>}
            <button type="button" className="is-primary" disabled={draft.behavior.requireAcknowledgement && !acknowledged}>{content.primaryLabel || 'Продовжити'}</button>
          </footer>
        </div>
      </article>
    </div>
  </div>;
}

export function PopupBannersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<PopupCampaignInput>(() => emptyCampaign());
  const [tab, setTab] = useState<EditorTab>('content');
  const [productText, setProductText] = useState('');
  const [isCreating, setIsCreating] = useState(true);
  const campaigns = useQuery({ queryKey: ['popup-campaigns'], queryFn: api.popupBanners.list });
  const options = useQuery({ queryKey: ['popup-campaign-options'], queryFn: api.popupBanners.options });
  const embed = useQuery({ queryKey: ['popup-embed-code'], queryFn: api.popupBanners.embedCode });
  const createCampaign = useMutation({ mutationFn: api.popupBanners.create });
  const updateCampaign = useMutation({ mutationFn: ({ id, input }: { id: string; input: PopupCampaignInput }) => api.popupBanners.update(id, input) });
  const changeStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: PopupCampaignStatus }) => api.popupBanners.setStatus(id, status) });
  const removeCampaign = useMutation({ mutationFn: api.popupBanners.remove });
  const selectedCampaign = campaigns.data?.find((item) => item.id === selectedId) || null;
  const saving = createCampaign.isPending || updateCampaign.isPending;

  useEffect(() => {
    if (selectedId || isCreating || !campaigns.data?.[0]) return;
    const campaign = campaigns.data[0];
    setSelectedId(campaign.id);
    setDraft(campaignInput(campaign));
    setProductText(campaign.productTargets.map((item) => item.sku).join('\n'));
  }, [campaigns.data, isCreating, selectedId]);

  const targetSummary = useMemo(() => {
    const target = draft.targeting;
    if (target.mode === 'all_pages') return 'Усі сторінки сайту';
    if (target.mode === 'all_products') return 'Усі сторінки товарів';
    if (target.mode === 'products') return `${inputLines(productText).length} вказаних позицій`;
    const count = target.stickers.length + target.brands.length + target.categoryIds.length
      + target.conditions.length + target.urlContains.length;
    return `${count} умов · ${target.match === 'all' ? 'усі одночасно' : 'будь-яка'}`;
  }, [draft.targeting, productText]);

  function editCampaign(campaign: PopupCampaign) {
    setSelectedId(campaign.id);
    setIsCreating(false);
    setDraft(campaignInput(campaign));
    setProductText(campaign.productTargets.map((item) => item.sku).join('\n'));
    setTab('content');
  }

  function createNew() {
    setSelectedId('');
    setIsCreating(true);
    setDraft(emptyCampaign());
    setProductText('');
    setTab('content');
  }

  function updateTargeting(patch: Partial<PopupTargeting>) {
    setDraft((current) => ({ ...current, targeting: { ...current.targeting, ...patch } }));
  }

  function toggleRule(key: 'stickers' | 'brands' | 'categoryIds' | 'conditions', value: string) {
    if (!value) return;
    const current = draft.targeting[key];
    updateTargeting({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  async function save() {
    const input = { ...draft, productEntries: inputLines(productText) };
    try {
      const saved = isCreating
        ? await createCampaign.mutateAsync(input)
        : await updateCampaign.mutateAsync({ id: selectedId, input });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['popup-campaign-options'] })
      ]);
      setSelectedId(saved.id);
      setIsCreating(false);
      setDraft(campaignInput(saved));
      setProductText(saved.productTargets.map((item) => item.sku).join('\n'));
      const missed = saved.resolution?.unmatched || [];
      showToast(missed.length ? `Кампанію збережено. Не знайдено позицій: ${missed.length}.` : 'Попап-кампанію збережено.', missed.length ? 'error' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти кампанію.', 'error');
    }
  }

  async function setStatus(status: PopupCampaignStatus) {
    if (!selectedId) return;
    try {
      const updated = await changeStatus.mutateAsync({ id: selectedId, status });
      queryClient.setQueryData<PopupCampaign[]>(['popup-campaigns'], (current = []) => current.map((item) => item.id === updated.id ? updated : item));
      showToast(status === 'active' ? 'Кампанію опубліковано.' : status === 'paused' ? 'Кампанію призупинено.' : 'Кампанію повернено у чернетки.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function remove() {
    if (!selectedId || !await confirm({
      title: 'Видалити попап-кампанію?',
      message: 'Кампанію, її версії, товарні прив’язки та статистику буде видалено безповоротно.',
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    try {
      await removeCampaign.mutateAsync(selectedId);
      await queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
      createNew();
      showToast('Кампанію видалено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити кампанію.', 'error');
    }
  }

  async function copyEmbed() {
    if (!embed.data?.code) return;
    try {
      await navigator.clipboard.writeText(embed.data.code);
      showToast('Код віджета скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  const stickerOptions = (options.data?.stickers || []).map((item) => ({
    value: item.id || item.title.toLocaleLowerCase('uk-UA'),
    label: item.title
  }));
  const brandOptions = (options.data?.brands || []).map((item) => ({ value: item, label: item }));
  const categoryOptions = (options.data?.categories || []).map((item) => ({ value: item.id, label: item.title || item.id }));
  const conditionOptions = (options.data?.conditions || []).map((item) => ({ value: item, label: item }));

  return <div className="popup-banners-page">
    <header className="page-heading popup-banners-heading">
      <div><p className="eyebrow">Комунікація на сайті</p><h1>Попап-банери</h1><p>Створюйте кампанії для конкретних товарів або динамічних умов каталогу Хорошоп.</p></div>
      <div className="page-heading__actions">
        <button className="button button--secondary" type="button" onClick={() => void copyEmbed()} disabled={!embed.data?.code}><Icon name="copy" size={17} /> Код для сайту</button>
        <button className="button button--primary" type="button" onClick={createNew}><Icon name="add" size={18} /> Нова кампанія</button>
      </div>
    </header>

    {!options.isLoading && !options.data?.integration && <div className="popup-integration-warning"><Icon name="integrations" size={22} /><span><strong>Хорошоп не підключено</strong><small>Підключіть магазин і синхронізуйте каталог, щоб налаштовувати товарні кампанії.</small></span></div>}
    {options.data?.integration && <div className="popup-integration-status"><span className="status-dot" /> <strong>{options.data.integration.storeDomain}</strong><small>Каталог: {options.data.integration.status} · синхронізація {formatDate(options.data.integration.lastSyncAt)}</small></div>}

    <div className="popup-banners-workspace">
      <aside className="popup-campaign-list">
        <header><span><small>КАМПАНІЇ</small><strong>{campaigns.data?.length || 0}</strong></span><button className="icon-button" type="button" onClick={createNew} aria-label="Нова кампанія"><Icon name="add" size={19} /></button></header>
        {campaigns.isLoading && <div className="popup-list-state">Завантажуємо…</div>}
        {campaigns.isError && <div className="popup-list-state is-error">Не вдалося завантажити кампанії.</div>}
        {!campaigns.isLoading && !campaigns.data?.length && <div className="popup-list-state"><Icon name="popup" size={26} /><strong>Кампаній ще немає</strong><small>Створіть перший попап для товарів.</small></div>}
        <div className="popup-campaign-list__items">
          {campaigns.data?.map((campaign) => <button type="button" className={campaign.id === selectedId && !isCreating ? 'is-active' : ''} key={campaign.id} onClick={() => editCampaign(campaign)}>
            <span className={`popup-status is-${campaign.status}`}>{statusLabels[campaign.status]}</span>
            <strong>{campaign.name}</strong>
            <small>{campaign.targeting.mode === 'products' ? `${campaign.productTargets.length} позицій` : campaign.targeting.mode === 'rules' ? 'Динамічні умови' : campaign.targeting.mode === 'all_pages' ? 'Усі сторінки' : 'Усі товари'}</small>
            <span className="popup-campaign-list__stats"><span>{campaign.stats.impressions} показів</span><span>{campaign.stats.acknowledgements + campaign.stats.clicks} дій</span></span>
          </button>)}
        </div>
      </aside>

      <main className="popup-editor">
        <header className="popup-editor__header">
          <div><small>{isCreating ? 'НОВА КАМПАНІЯ' : statusLabels[selectedCampaign?.status || 'draft']}</small><input value={draft.name} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="Назва кампанії" /></div>
          <div className="popup-editor__actions">
            {!isCreating && selectedCampaign?.status !== 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('active')} disabled={changeStatus.isPending}><Icon name="publication" size={16} /> Опублікувати</button>}
            {!isCreating && selectedCampaign?.status === 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('paused')} disabled={changeStatus.isPending}><Icon name="deadline" size={16} /> Призупинити</button>}
            {!isCreating && <button className="icon-button icon-button--danger" type="button" onClick={() => void remove()} aria-label="Видалити кампанію"><Icon name="delete" size={18} /></button>}
            <button className="button button--primary button--small" type="button" onClick={() => void save()} disabled={saving || !options.data?.integration}><Icon name="save" size={16} /> {saving ? 'Зберігаємо…' : 'Зберегти'}</button>
          </div>
        </header>

        <nav className="popup-editor-tabs" aria-label="Розділи конструктора">
          {([['content', 'Контент і дизайн'], ['targeting', 'Умови показу'], ['behavior', 'Поведінка й розклад']] as Array<[EditorTab, string]>).map(([value, label]) => <button type="button" className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)} key={value}>{label}</button>)}
        </nav>

        <div className="popup-editor__body">
          <section className="popup-editor__form">
            {tab === 'content' && <>
              <div className="popup-form-section"><h2>Текст попапа</h2><p>Доступні змінні: <code>{'{{product.title}}'}</code>, <code>{'{{product.article}}'}</code>, <code>{'{{product.condition}}'}</code>.</p>
                <div className="popup-form-grid">
                  <label><span>Надзаголовок</span><input value={draft.content.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, eyebrow: event.target.value } }))} /></label>
                  <label><span>Заголовок</span><input value={draft.content.title} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, title: event.target.value } }))} /></label>
                  <label className="is-full"><span>Основний текст</span><textarea rows={6} value={draft.content.body} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, body: event.target.value } }))} /></label>
                  <label><span>Основна кнопка</span><input value={draft.content.primaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryLabel: event.target.value } }))} /></label>
                  <label><span>Додаткова кнопка</span><input value={draft.content.secondaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, secondaryLabel: event.target.value } }))} /></label>
                  <label className="is-full"><span>Посилання основної кнопки</span><input type="url" placeholder="https://... або /шлях/" value={draft.content.primaryUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryUrl: event.target.value } }))} /></label>
                  <label className="is-full"><span>Зображення</span><input type="url" placeholder="https://..." value={draft.content.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, imageUrl: event.target.value } }))} /></label>
                </div>
              </div>
              <div className="popup-form-section"><h2>Оформлення</h2>
                <div className="popup-form-grid">
                  <label><span>Тип попапа</span><StyledSelect value={draft.styles.layout} options={[{ value: 'modal', label: 'Модальне вікно' }, { value: 'bottom-sheet', label: 'Нижня панель' }, { value: 'corner', label: 'Кутова картка' }]} onChange={(layout) => setDraft((current) => ({ ...current, styles: { ...current.styles, layout } }))} /></label>
                  <label><span>Максимальна ширина</span><input type="number" min={320} max={760} value={draft.styles.maxWidth} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, maxWidth: Number(event.target.value) } }))} /></label>
                  <label><span>Акцент</span><input className="popup-color-input" type="color" value={draft.styles.accentColor} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, accentColor: event.target.value } }))} /></label>
                  <label><span>Фон</span><input className="popup-color-input" type="color" value={draft.styles.backgroundColor} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, backgroundColor: event.target.value } }))} /></label>
                  <label><span>Колір тексту</span><input className="popup-color-input" type="color" value={draft.styles.textColor} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, textColor: event.target.value } }))} /></label>
                  <label><span>Заокруглення</span><input type="number" min={0} max={40} value={draft.styles.borderRadius} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, borderRadius: Number(event.target.value) } }))} /></label>
                </div>
              </div>
            </>}

            {tab === 'targeting' && <>
              <div className="popup-form-section"><h2>Де показувати</h2><p>{targetSummary}</p>
                <label><span>Тип вибірки</span><StyledSelect value={draft.targeting.mode} options={[{ value: 'products', label: 'Вказані товари та артикули' }, { value: 'rules', label: 'Динамічні умови каталогу' }, { value: 'all_products', label: 'Усі товари' }, { value: 'all_pages', label: 'Усі сторінки сайту' }]} onChange={(mode) => updateTargeting({ mode })} /></label>
              </div>
              {draft.targeting.mode === 'products' && <div className="popup-form-section"><h2>Назви та артикули</h2><p>Кожна позиція з нового рядка. Можна вказувати батьківські товари або конкретні модифікації.</p><textarea className="popup-products-input" rows={12} value={productText} onChange={(event) => setProductText(event.target.value)} placeholder={'П0000012345\nСмартфон Apple iPhone 15 128GB Black'} /></div>}
              {draft.targeting.mode === 'rules' && <div className="popup-form-section"><h2>Правила каталогу</h2><p>Порожні групи не враховуються. Усередині групи достатньо одного збігу.</p>
                <label><span>Логіка між групами</span><StyledSelect value={draft.targeting.match} options={[{ value: 'all', label: 'Мають виконуватись усі групи' }, { value: 'any', label: 'Достатньо будь-якої групи' }]} onChange={(match) => updateTargeting({ match })} /></label>
                <RulePicker label="Стікери" values={draft.targeting.stickers} selected="" options={stickerOptions} onChange={(value) => toggleRule('stickers', value)} />
                {!options.isLoading && stickerOptions.length === 0 && <div className="popup-rule-note"><Icon name="deadline" size={16} /> У поточному каталозі Хорошоп не отримано жодного призначеного стікера. Після синхронізації перевірте це поле ще раз.</div>}
                <RulePicker label="Бренди" values={draft.targeting.brands} selected="" options={brandOptions} onChange={(value) => toggleRule('brands', value)} />
                <RulePicker label="Категорії" values={draft.targeting.categoryIds} selected="" options={categoryOptions} onChange={(value) => toggleRule('categoryIds', value)} />
                <RulePicker label="Стан товару" values={draft.targeting.conditions} selected="" options={conditionOptions} onChange={(value) => toggleRule('conditions', value)} />
                <label><span>URL містить — по одному фрагменту з рядка</span><textarea rows={4} value={draft.targeting.urlContains.join('\n')} onChange={(event) => updateTargeting({ urlContains: inputLines(event.target.value) })} placeholder="/vzhyvani-smartfony/" /></label>
              </div>}
            </>}

            {tab === 'behavior' && <>
              <div className="popup-form-section"><h2>Поведінка</h2>
                <div className="popup-form-grid">
                  <label><span>Затримка, мс</span><input type="number" min={0} max={60000} step={100} value={draft.behavior.delayMs} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, delayMs: Number(event.target.value) } }))} /></label>
                  <label><span>Частота показу</span><StyledSelect value={draft.behavior.frequency} options={[{ value: 'always', label: 'Під час кожного перегляду' }, { value: 'session', label: 'Один раз за сесію' }, { value: 'product', label: 'Один раз для кожного товару' }, { value: 'days', label: 'Повторити через кілька днів' }]} onChange={(frequency) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, frequency } }))} /></label>
                  {draft.behavior.frequency === 'days' && <label><span>Повторити через, днів</span><input type="number" min={1} max={365} value={draft.behavior.cooldownDays} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, cooldownDays: Number(event.target.value) } }))} /></label>}
                </div>
                <Toggle checked={draft.behavior.dismissible} label="Можна закрити" description="Показувати хрестик, додаткову кнопку та дозволити клік по фону." onChange={(dismissible) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, dismissible } }))} />
                <Toggle checked={draft.behavior.requireAcknowledgement} label="Обов’язкове підтвердження" description="Основна кнопка стане доступною лише після встановлення прапорця." onChange={(requireAcknowledgement) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, requireAcknowledgement } }))} />
                {draft.behavior.requireAcknowledgement && <label><span>Текст підтвердження</span><textarea rows={3} value={draft.content.acknowledgementLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, acknowledgementLabel: event.target.value } }))} /></label>}
              </div>
              <div className="popup-form-section"><h2>Розклад</h2><p>Час інтерпретується у часовому поясі вашого браузера і зберігається з часовою зоною.</p>
                <div className="popup-form-grid">
                  <label><span>Початок</span><input type="datetime-local" value={localDateTime(draft.startsAt)} onChange={(event) => setDraft((current) => ({ ...current, startsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Завершення</span><input type="datetime-local" value={localDateTime(draft.endsAt)} onChange={(event) => setDraft((current) => ({ ...current, endsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Пріоритет</span><input type="number" min={0} max={1000} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))} /></label>
                </div>
              </div>
            </>}
          </section>
          <aside className="popup-editor__preview"><Preview draft={draft} /><div className="popup-preview-summary"><span><strong>Ціль</strong><small>{targetSummary}</small></span><span><strong>Показ</strong><small>{draft.behavior.frequency === 'product' ? 'Раз для кожного товару' : draft.behavior.frequency === 'session' ? 'Раз за сесію' : draft.behavior.frequency === 'days' ? `Раз на ${draft.behavior.cooldownDays} дн.` : 'Кожен перегляд'}</small></span></div></aside>
        </div>
      </main>
    </div>
  </div>;
}
