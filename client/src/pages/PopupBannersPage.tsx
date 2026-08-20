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
  PopupLayout,
  PopupTargetMode,
  PopupTargeting
} from '../types/popup-banner';
import '../styles/popup-banners.css';

type EditorTab = 'content' | 'targeting' | 'behavior';
type CampaignFilter = 'all' | PopupCampaignStatus;
type PreviewViewport = 'desktop' | 'mobile';

const statusLabels: Record<PopupCampaignStatus, string> = {
  draft: 'Чернетка',
  active: 'Активна',
  paused: 'Призупинена'
};

const layoutLabels: Record<PopupLayout, string> = {
  modal: 'По центру',
  'bottom-sheet': 'Знизу',
  corner: 'У кутку'
};

const targetModeLabels: Record<PopupTargetMode, string> = {
  products: 'Вказані товари',
  rules: 'Умови каталогу',
  all_products: 'Усі товари',
  all_pages: 'Усі сторінки'
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
      primaryButtonBackgroundColor: '#6d5dfc',
      primaryButtonTextColor: '#ffffff',
      secondaryButtonBackgroundColor: '#ffffff',
      secondaryButtonTextColor: '#172033',
      checkboxAccentColor: '#6d5dfc',
      checkboxCheckColor: '#ffffff',
      checkboxTextColor: '#172033',
      eyebrowFontSize: 12,
      titleFontSize: 34,
      bodyFontSize: 16,
      acknowledgementFontSize: 14,
      buttonFontSize: 16,
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
      requireAcknowledgement: false,
      buttonCount: 2
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
    <span className="popup-toggle__copy"><strong>{label}</strong><small>{description}</small></span>
    <input className="switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function SectionHeading({ icon, title, description, aside }: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  description: string;
  aside?: string;
}) {
  return <header className="popup-section-heading">
    <span className="popup-section-heading__icon"><Icon name={icon} size={19} /></span>
    <div><h2>{title}</h2><p>{description}</p></div>
    {aside && <small>{aside}</small>}
  </header>;
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

function LayoutPicker({ value, onChange }: { value: PopupLayout; onChange: (value: PopupLayout) => void }) {
  const layouts: PopupLayout[] = ['modal', 'bottom-sheet', 'corner'];
  return <div className="popup-layout-picker" role="radiogroup" aria-label="Розташування попапа">
    {layouts.map((layout) => <button
      type="button"
      role="radio"
      aria-checked={layout === value}
      className={layout === value ? 'is-active' : ''}
      key={layout}
      onClick={() => onChange(layout)}
    >
      <span className={`popup-layout-picker__scheme is-${layout}`}><i /></span>
      <strong>{layoutLabels[layout]}</strong>
    </button>)}
  </div>;
}

function TargetModePicker({ value, onChange }: { value: PopupTargetMode; onChange: (value: PopupTargetMode) => void }) {
  const modes: Array<{ value: PopupTargetMode; icon: Parameters<typeof Icon>[0]['name']; description: string }> = [
    { value: 'products', icon: 'productSelection', description: 'Назви, артикули або модифікації' },
    { value: 'rules', icon: 'characteristics', description: 'Стікери, бренди, категорії та стан' },
    { value: 'all_products', icon: 'storefront', description: 'Будь-яка сторінка товару' },
    { value: 'all_pages', icon: 'productPage', description: 'Увесь сайт без обмежень' }
  ];
  return <div className="popup-target-mode" role="radiogroup" aria-label="Тип вибірки">
    {modes.map((mode) => <button
      type="button"
      role="radio"
      aria-checked={mode.value === value}
      className={mode.value === value ? 'is-active' : ''}
      key={mode.value}
      onClick={() => onChange(mode.value)}
    >
      <span><Icon name={mode.icon} size={18} /></span>
      <div><strong>{targetModeLabels[mode.value]}</strong><small>{mode.description}</small></div>
      <i><Icon name="check" size={13} /></i>
    </button>)}
  </div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="popup-color-field">
    <span>{label}</span>
    <div>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label}: вибрати колір`} />
      <input type="text" value={value} readOnly aria-label={`${label}: HEX`} />
    </div>
  </label>;
}

function Preview({ draft }: { draft: PopupCampaignInput }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const content = draft.content;
  const styles = draft.styles;
  return <div className="popup-live-preview">
    <header>
      <div><strong>Живий перегляд</strong><small>Так попап виглядатиме на сайті</small></div>
      <div className="popup-preview-device" role="group" aria-label="Розмір попереднього перегляду">
        <button type="button" className={viewport === 'desktop' ? 'is-active' : ''} onClick={() => setViewport('desktop')} aria-label="Комп’ютер"><Icon name="monitor" size={16} /></button>
        <button type="button" className={viewport === 'mobile' ? 'is-active' : ''} onClick={() => setViewport('mobile')} aria-label="Телефон"><Icon name="phone" size={16} /></button>
      </div>
    </header>
    <div className={`popup-preview is-${styles.layout} is-${viewport}`} style={{
      '--preview-accent': styles.accentColor,
      '--preview-bg': styles.backgroundColor,
      '--preview-text': styles.textColor,
      '--preview-muted': styles.mutedColor,
      '--preview-primary-bg': styles.primaryButtonBackgroundColor,
      '--preview-primary-text': styles.primaryButtonTextColor,
      '--preview-secondary-bg': styles.secondaryButtonBackgroundColor,
      '--preview-secondary-text': styles.secondaryButtonTextColor,
      '--preview-checkbox': styles.checkboxAccentColor,
      '--preview-checkbox-check': styles.checkboxCheckColor,
      '--preview-checkbox-text': styles.checkboxTextColor,
      '--preview-eyebrow-size': `${styles.eyebrowFontSize}px`,
      '--preview-title-size': `${styles.titleFontSize}px`,
      '--preview-body-size': `${styles.bodyFontSize}px`,
      '--preview-ack-size': `${styles.acknowledgementFontSize}px`,
      '--preview-button-size': `${styles.buttonFontSize}px`,
      '--preview-radius': `${styles.borderRadius}px`,
      '--preview-width': `${styles.maxWidth}px`
    } as CSSProperties}>
      <div className="popup-preview__browser">
        <span /><span /><span />
        <div>mobiletrend.com.ua</div>
      </div>
      <div className="popup-preview__stage">
        <div className="popup-preview__storefront" aria-hidden="true">
          <div className="popup-preview__storefront-header"><b /><span /><span /><span /></div>
          <div className="popup-preview__storefront-product"><i /><div><b /><span /><span /><button /></div></div>
        </div>
        <article className="popup-preview__card">
          {draft.behavior.dismissible && <span className="popup-preview__close">×</span>}
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
              {draft.behavior.buttonCount === 2 && <button type="button">{content.secondaryLabel || 'Закрити'}</button>}
              <button type="button" className="is-primary" disabled={draft.behavior.requireAcknowledgement && !acknowledged}>{content.primaryLabel || 'Продовжити'}</button>
            </footer>
          </div>
        </article>
      </div>
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
  const [isCreating, setIsCreating] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('all');
  const campaigns = useQuery({ queryKey: ['popup-campaigns'], queryFn: api.popupBanners.list });
  const options = useQuery({ queryKey: ['popup-campaign-options'], queryFn: api.popupBanners.options });
  const embed = useQuery({ queryKey: ['popup-embed-code'], queryFn: api.popupBanners.embedCode });
  const createCampaign = useMutation({ mutationFn: api.popupBanners.create });
  const updateCampaign = useMutation({ mutationFn: ({ id, input }: { id: string; input: PopupCampaignInput }) => api.popupBanners.update(id, input) });
  const changeStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: PopupCampaignStatus }) => api.popupBanners.setStatus(id, status) });
  const removeCampaign = useMutation({ mutationFn: api.popupBanners.remove });
  const selectedCampaign = campaigns.data?.find((item) => item.id === selectedId) || null;
  const saving = createCampaign.isPending || updateCampaign.isPending;

  const campaignOverview = useMemo(() => {
    const items = campaigns.data || [];
    return {
      active: items.filter((item) => item.status === 'active').length,
      impressions: items.reduce((sum, item) => sum + item.stats.impressions, 0),
      actions: items.reduce((sum, item) => sum + item.stats.acknowledgements + item.stats.clicks, 0)
    };
  }, [campaigns.data]);

  const visibleCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLocaleLowerCase('uk-UA');
    return (campaigns.data || []).filter((campaign) => {
      if (campaignFilter !== 'all' && campaign.status !== campaignFilter) return false;
      return !query || campaign.name.toLocaleLowerCase('uk-UA').includes(query);
    });
  }, [campaignFilter, campaignSearch, campaigns.data]);

  useEffect(() => {
    if (selectedId || isCreating || !campaigns.data) return;
    const campaign = campaigns.data[0];
    if (!campaign) {
      setIsCreating(true);
      return;
    }
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

  const currentInput = useMemo(() => ({ ...draft, productEntries: inputLines(productText) }), [draft, productText]);
  const isDirty = useMemo(() => {
    if (isCreating || !selectedCampaign) return true;
    return JSON.stringify(currentInput) !== JSON.stringify(campaignInput(selectedCampaign));
  }, [currentInput, isCreating, selectedCampaign]);

  const behaviorSummary = draft.behavior.frequency === 'product'
    ? 'Раз для кожного товару'
    : draft.behavior.frequency === 'session'
      ? 'Раз за сесію'
      : draft.behavior.frequency === 'days'
        ? `Раз на ${draft.behavior.cooldownDays} дн.`
        : 'Кожен перегляд';

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
    <header className="popup-banners-header">
      <div className="popup-banners-header__copy">
        <p className="eyebrow">Комунікація на сайті</p>
        <h1>Попап-банери</h1>
        <p>Створюйте охайні повідомлення та показуйте їх потрібним покупцям у потрібний момент.</p>
      </div>
      <div className="popup-banners-header__actions">
        <button className="button button--secondary" type="button" onClick={() => void copyEmbed()} disabled={!embed.data?.code}><Icon name="copy" size={17} /> Код для сайту</button>
        <button className="button button--primary" type="button" onClick={createNew}><Icon name="add" size={18} /> Нова кампанія</button>
      </div>
    </header>

    {!options.isLoading && !options.data?.integration && <div className="popup-connection is-warning">
      <span className="popup-connection__icon"><Icon name="integrations" size={21} /></span>
      <div><strong>Хорошоп не підключено</strong><small>Підключіть магазин і синхронізуйте каталог, щоб налаштовувати товарні кампанії.</small></div>
    </div>}
    {options.data?.integration && <div className="popup-connection is-connected">
      <span className="popup-connection__icon"><Icon name="storefront" size={20} /></span>
      <div><strong>{options.data.integration.storeDomain}</strong><small>Каталог підключено · остання синхронізація {formatDate(options.data.integration.lastSyncAt)}</small></div>
      <span className="popup-connection__badge"><i /> Підключено</span>
    </div>}

    <div className="popup-banners-workspace">
      <aside className="popup-campaign-list">
        <header className="popup-campaign-list__header">
          <div><span className="popup-campaign-list__icon"><Icon name="popup" size={19} /></span><div><small>БІБЛІОТЕКА</small><strong>Кампанії</strong></div></div>
          <button className="icon-button" type="button" onClick={createNew} aria-label="Нова кампанія"><Icon name="add" size={19} /></button>
        </header>

        <div className="popup-campaign-overview">
          <span><strong>{campaigns.data?.length || 0}</strong><small>всього</small></span>
          <span><strong>{campaignOverview.active}</strong><small>активні</small></span>
          <span><strong>{campaignOverview.impressions}</strong><small>покази</small></span>
        </div>

        <label className="popup-campaign-search">
          <Icon name="search" size={18} />
          <input value={campaignSearch} onChange={(event) => setCampaignSearch(event.target.value)} placeholder="Знайти кампанію" aria-label="Пошук кампаній" />
        </label>

        <div className="popup-campaign-filters" role="group" aria-label="Фільтр кампаній">
          {([['all', 'Усі'], ['active', 'Активні'], ['draft', 'Чернетки'], ['paused', 'Пауза']] as Array<[CampaignFilter, string]>).map(([value, label]) => <button type="button" className={campaignFilter === value ? 'is-active' : ''} onClick={() => setCampaignFilter(value)} key={value}>{label}</button>)}
        </div>

        {campaigns.isLoading && <div className="popup-list-state">Завантажуємо кампанії…</div>}
        {campaigns.isError && <div className="popup-list-state is-error">Не вдалося завантажити кампанії.</div>}
        {!campaigns.isLoading && !campaigns.data?.length && <div className="popup-list-state"><span><Icon name="popup" size={25} /></span><strong>Кампаній ще немає</strong><small>Створіть перше повідомлення для покупців.</small><button className="button button--primary button--small" type="button" onClick={createNew}>Створити кампанію</button></div>}
        {!campaigns.isLoading && Boolean(campaigns.data?.length) && !visibleCampaigns.length && <div className="popup-list-state"><strong>Нічого не знайдено</strong><small>Змініть пошук або фільтр статусу.</small></div>}

        <div className="popup-campaign-list__items">
          {visibleCampaigns.map((campaign) => <button type="button" className={campaign.id === selectedId && !isCreating ? 'is-active' : ''} key={campaign.id} onClick={() => editCampaign(campaign)}>
            <span className="popup-campaign-list__row"><span className={`popup-status is-${campaign.status}`}><i />{statusLabels[campaign.status]}</span><small>{formatDate(campaign.updatedAt)}</small></span>
            <strong>{campaign.name}</strong>
            <small>{campaign.targeting.mode === 'products' ? `${campaign.productTargets.length} позицій` : targetModeLabels[campaign.targeting.mode]}</small>
            <span className="popup-campaign-list__stats"><span><b>{campaign.stats.impressions}</b> показів</span><span><b>{campaign.stats.acknowledgements + campaign.stats.clicks}</b> дій</span></span>
          </button>)}
        </div>

        <footer className="popup-campaign-list__footer"><Icon name="visibility" size={15} /><span>Усього взаємодій: <strong>{campaignOverview.actions}</strong></span></footer>
      </aside>

      <main className="popup-editor">
        <header className="popup-editor__header">
          <div className="popup-editor__identity">
            <div><span className={`popup-status is-${selectedCampaign?.status || 'draft'}`}><i />{isCreating ? 'Нова кампанія' : statusLabels[selectedCampaign?.status || 'draft']}</span>{isDirty && <small className="popup-unsaved"><i /> Є незбережені зміни</small>}</div>
            <input value={draft.name} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="Назва кампанії" placeholder="Назва кампанії" />
            <p>{targetSummary} · {behaviorSummary}</p>
          </div>
          <div className="popup-editor__actions">
            {!isCreating && selectedCampaign?.status !== 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('active')} disabled={changeStatus.isPending || isDirty}><Icon name="publication" size={16} /> Опублікувати</button>}
            {!isCreating && selectedCampaign?.status === 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('paused')} disabled={changeStatus.isPending}><Icon name="deadline" size={16} /> Призупинити</button>}
            {!isCreating && <button className="icon-button icon-button--danger" type="button" onClick={() => void remove()} aria-label="Видалити кампанію"><Icon name="delete" size={18} /></button>}
            <button className="button button--primary button--small" type="button" onClick={() => void save()} disabled={saving || !options.data?.integration || !draft.name.trim() || !isDirty}><Icon name="save" size={16} /> {saving ? 'Зберігаємо…' : 'Зберегти'}</button>
          </div>
        </header>

        <nav className="popup-editor-tabs" aria-label="Розділи конструктора">
          {([
            ['content', 'popup', 'Контент і дизайн', `${layoutLabels[draft.styles.layout]} · ${draft.styles.maxWidth}px`],
            ['targeting', 'productSelection', 'Умови показу', targetSummary],
            ['behavior', 'schedule', 'Поведінка й розклад', behaviorSummary]
          ] as Array<[EditorTab, Parameters<typeof Icon>[0]['name'], string, string]>).map(([value, icon, label, summary], index) => <button type="button" className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)} key={value}>
            <span className="popup-editor-tabs__number">{index + 1}</span>
            <span className="popup-editor-tabs__icon"><Icon name={icon} size={18} /></span>
            <span><strong>{label}</strong><small>{summary}</small></span>
            <Icon name="arrow" size={17} />
          </button>)}
        </nav>

        <div className="popup-editor__body">
          <section className="popup-editor__form">
            {tab === 'content' && <>
              <div className="popup-form-section">
                <SectionHeading icon="edit" title="Текст повідомлення" description="Сформулюйте коротке повідомлення, яке покупець зрозуміє з першого погляду." />
                <div className="popup-template-variables"><span>Змінні товару</span><code>{'{{product.title}}'}</code><code>{'{{product.article}}'}</code><code>{'{{product.condition}}'}</code></div>
                <div className="popup-form-grid">
                  <label><span>Надзаголовок</span><input value={draft.content.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, eyebrow: event.target.value } }))} placeholder="Наприклад, Важлива інформація" /></label>
                  <label><span>Заголовок</span><input value={draft.content.title} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, title: event.target.value } }))} placeholder="Зверніть увагу" /></label>
                  <label className="is-full"><span>Основний текст</span><textarea rows={6} value={draft.content.body} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, body: event.target.value } }))} /><small>{draft.content.body.length} символів</small></label>
                  <label className="is-full"><span>Зображення</span><input type="url" placeholder="https://..." value={draft.content.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, imageUrl: event.target.value } }))} /><small>Необов’язково. Використовуйте пряме HTTPS-посилання.</small></label>
                </div>
              </div>

              <div className="popup-form-section">
                <SectionHeading icon="link" title="Кнопки й дія" description="Назвіть дію зрозуміло та вкажіть сторінку, куди вона веде." />
                <div className="popup-form-grid">
                  <label><span>Кількість кнопок</span><StyledSelect value={String(draft.behavior.buttonCount)} options={[{ value: '1', label: 'Одна кнопка' }, { value: '2', label: 'Дві кнопки' }]} onChange={(value) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, buttonCount: Number(value) as 1 | 2 } }))} ariaLabel="Кількість кнопок" /></label>
                  <label><span>Основна кнопка</span><input value={draft.content.primaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryLabel: event.target.value } }))} /></label>
                  {draft.behavior.buttonCount === 2 && <label><span>Додаткова кнопка</span><input value={draft.content.secondaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, secondaryLabel: event.target.value } }))} /></label>}
                  <label className="is-full"><span>Посилання основної кнопки</span><input type="url" placeholder="https://... або /шлях/" value={draft.content.primaryUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryUrl: event.target.value } }))} /></label>
                </div>
                <div className="popup-color-groups">
                  <div><strong>Основна кнопка</strong><div className="popup-color-grid is-pair">
                    <ColorField label="Колір кнопки" value={draft.styles.primaryButtonBackgroundColor} onChange={(primaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonBackgroundColor } }))} />
                    <ColorField label="Колір тексту" value={draft.styles.primaryButtonTextColor} onChange={(primaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonTextColor } }))} />
                  </div></div>
                  {draft.behavior.buttonCount === 2 && <div><strong>Додаткова кнопка</strong><div className="popup-color-grid is-pair">
                    <ColorField label="Колір кнопки" value={draft.styles.secondaryButtonBackgroundColor} onChange={(secondaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, secondaryButtonBackgroundColor } }))} />
                    <ColorField label="Колір тексту" value={draft.styles.secondaryButtonTextColor} onChange={(secondaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, secondaryButtonTextColor } }))} />
                  </div></div>}
                </div>
              </div>

              <div className="popup-form-section">
                <SectionHeading icon="productCard" title="Вигляд попапа" description="Оберіть розташування, кольори та комфортний розмір повідомлення." />
                <LayoutPicker value={draft.styles.layout} onChange={(layout) => setDraft((current) => ({ ...current, styles: { ...current.styles, layout } }))} />
                <div className="popup-color-grid is-base">
                  <ColorField label="Акцент" value={draft.styles.accentColor} onChange={(accentColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, accentColor } }))} />
                  <ColorField label="Фон" value={draft.styles.backgroundColor} onChange={(backgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, backgroundColor } }))} />
                  <ColorField label="Заголовок" value={draft.styles.textColor} onChange={(textColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, textColor } }))} />
                  <ColorField label="Основний текст" value={draft.styles.mutedColor} onChange={(mutedColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, mutedColor } }))} />
                </div>
                <div className="popup-settings-group">
                  <strong>Розміри шрифту</strong>
                  <div className="popup-form-grid popup-font-grid">
                    <label><span>Надзаголовок, px</span><input type="number" min={8} max={32} value={draft.styles.eyebrowFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, eyebrowFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Заголовок, px</span><input type="number" min={18} max={72} value={draft.styles.titleFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, titleFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Основний текст, px</span><input type="number" min={10} max={36} value={draft.styles.bodyFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, bodyFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Підтвердження, px</span><input type="number" min={10} max={28} value={draft.styles.acknowledgementFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, acknowledgementFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Кнопки, px</span><input type="number" min={10} max={28} value={draft.styles.buttonFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, buttonFontSize: Number(event.target.value) } }))} /></label>
                  </div>
                </div>
                <div className="popup-settings-group">
                  <strong>Стиль чекбокса підтвердження</strong>
                  <small>Ці кольори застосуються, коли в розділі поведінки увімкнено явне підтвердження.</small>
                  <div className="popup-color-grid">
                    <ColorField label="Колір чекбокса" value={draft.styles.checkboxAccentColor} onChange={(checkboxAccentColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxAccentColor } }))} />
                    <ColorField label="Колір галочки" value={draft.styles.checkboxCheckColor} onChange={(checkboxCheckColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxCheckColor } }))} />
                    <ColorField label="Колір тексту чекбокса" value={draft.styles.checkboxTextColor} onChange={(checkboxTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxTextColor } }))} />
                  </div>
                </div>
                <div className="popup-form-grid popup-dimensions-grid">
                  <label><span>Максимальна ширина, px</span><input type="number" min={320} max={1400} step={10} value={draft.styles.maxWidth} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, maxWidth: Number(event.target.value) } }))} /><small>До 1400 px; на вузьких екранах попап автоматично вміститься у viewport.</small></label>
                  <label><span>Заокруглення, px</span><input type="number" min={0} max={40} value={draft.styles.borderRadius} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, borderRadius: Number(event.target.value) } }))} /></label>
                </div>
              </div>
            </>}

            {tab === 'targeting' && <>
              <div className="popup-form-section">
                <SectionHeading icon="productSelection" title="Де показувати" description="Оберіть найпростіший спосіб сформувати аудиторію цієї кампанії." aside={targetSummary} />
                <TargetModePicker value={draft.targeting.mode} onChange={(mode) => updateTargeting({ mode })} />
              </div>
              {draft.targeting.mode === 'products' && <div className="popup-form-section">
                <SectionHeading icon="catalog" title="Товари й модифікації" description="Вкажіть кожну назву або артикул з нового рядка. Система знайде точні позиції в каталозі." aside={`${inputLines(productText).length} позицій`} />
                <label><span>Назви та артикули</span><textarea className="popup-products-input" rows={12} value={productText} onChange={(event) => setProductText(event.target.value)} placeholder={'П0000012345\nСмартфон Apple iPhone 15 128GB Black'} /></label>
              </div>}
              {draft.targeting.mode === 'rules' && <div className="popup-form-section">
                <SectionHeading icon="characteristics" title="Правила каталогу" description="Додавайте лише потрібні групи. Порожні правила не впливають на вибірку." aside={`${draft.targeting.stickers.length + draft.targeting.brands.length + draft.targeting.categoryIds.length + draft.targeting.conditions.length + draft.targeting.urlContains.length} умов`} />
                <label><span>Логіка між групами</span><StyledSelect value={draft.targeting.match} options={[{ value: 'all', label: 'Мають виконуватись усі групи' }, { value: 'any', label: 'Достатньо будь-якої групи' }]} onChange={(match) => updateTargeting({ match })} ariaLabel="Логіка між групами" /></label>
                <div className="popup-rules-grid">
                  <RulePicker label="Стікери" values={draft.targeting.stickers} selected="" options={stickerOptions} onChange={(value) => toggleRule('stickers', value)} />
                  <RulePicker label="Бренди" values={draft.targeting.brands} selected="" options={brandOptions} onChange={(value) => toggleRule('brands', value)} />
                  <RulePicker label="Категорії" values={draft.targeting.categoryIds} selected="" options={categoryOptions} onChange={(value) => toggleRule('categoryIds', value)} />
                  <RulePicker label="Стан товару" values={draft.targeting.conditions} selected="" options={conditionOptions} onChange={(value) => toggleRule('conditions', value)} />
                </div>
                {!options.isLoading && stickerOptions.length === 0 && <div className="popup-rule-note"><Icon name="deadline" size={16} /> У поточному каталозі Хорошоп ще не отримано призначених стікерів. Після синхронізації перевірте поле ще раз.</div>}
                <label><span>URL містить — один фрагмент з рядка</span><textarea rows={4} value={draft.targeting.urlContains.join('\n')} onChange={(event) => updateTargeting({ urlContains: inputLines(event.target.value) })} placeholder="/vzhyvani-smartfony/" /></label>
              </div>}
              {(draft.targeting.mode === 'all_products' || draft.targeting.mode === 'all_pages') && <div className="popup-wide-target-note"><span><Icon name="visibility" size={20} /></span><div><strong>Широка аудиторія</strong><p>Попап охопить {draft.targeting.mode === 'all_pages' ? 'всі сторінки сайту' : 'всі картки товарів'}. Перевірте частоту показу, щоб повідомлення не заважало покупцям.</p></div></div>}
            </>}

            {tab === 'behavior' && <>
              <div className="popup-form-section">
                <SectionHeading icon="schedule" title="Частота й взаємодія" description="Керуйте моментом появи та повторними показами для одного покупця." aside={behaviorSummary} />
                <div className="popup-form-grid">
                  <label><span>Затримка перед показом, мс</span><input type="number" min={0} max={60000} step={100} value={draft.behavior.delayMs} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, delayMs: Number(event.target.value) } }))} /><small>300–800 мс зазвичай сприймаються природно.</small></label>
                  <label><span>Частота показу</span><StyledSelect value={draft.behavior.frequency} options={[{ value: 'always', label: 'Під час кожного перегляду' }, { value: 'session', label: 'Один раз за сесію' }, { value: 'product', label: 'Один раз для кожного товару' }, { value: 'days', label: 'Повторити через кілька днів' }]} onChange={(frequency) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, frequency } }))} ariaLabel="Частота показу" /></label>
                  {draft.behavior.frequency === 'days' && <label><span>Повторити через, днів</span><input type="number" min={1} max={365} value={draft.behavior.cooldownDays} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, cooldownDays: Number(event.target.value) } }))} /></label>}
                </div>
                <div className="popup-toggle-list">
                  <Toggle checked={draft.behavior.dismissible} label="Покупець може закрити попап" description="Показувати хрестик і дозволити закриття кліком по затемненому фону." onChange={(dismissible) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, dismissible } }))} />
                  <Toggle checked={draft.behavior.requireAcknowledgement} label="Потрібне явне підтвердження" description="Основна кнопка стане доступною лише після встановлення прапорця." onChange={(requireAcknowledgement) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, requireAcknowledgement } }))} />
                </div>
                {draft.behavior.requireAcknowledgement && <>
                  <label><span>Текст підтвердження</span><textarea rows={3} value={draft.content.acknowledgementLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, acknowledgementLabel: event.target.value } }))} /></label>
                </>}
              </div>
              <div className="popup-form-section">
                <SectionHeading icon="calendar" title="Розклад кампанії" description="Залиште поля порожніми, якщо кампанія не має часових обмежень." />
                <div className="popup-form-grid">
                  <label><span>Початок</span><input type="datetime-local" value={localDateTime(draft.startsAt)} onChange={(event) => setDraft((current) => ({ ...current, startsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Завершення</span><input type="datetime-local" value={localDateTime(draft.endsAt)} onChange={(event) => setDraft((current) => ({ ...current, endsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Пріоритет</span><input type="number" min={0} max={1000} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))} /><small>Якщо підходять кілька кампаній, перемагає більший пріоритет.</small></label>
                </div>
              </div>
            </>}
          </section>
          <aside className="popup-editor__preview">
            <Preview draft={draft} />
            <div className="popup-preview-summary">
              <span><i><Icon name="productSelection" size={16} /></i><span><strong>Аудиторія</strong><small>{targetSummary}</small></span></span>
              <span><i><Icon name="schedule" size={16} /></i><span><strong>Частота</strong><small>{behaviorSummary}</small></span></span>
              <span><i><Icon name="calendar" size={16} /></i><span><strong>Період</strong><small>{draft.startsAt || draft.endsAt ? `${formatDate(draft.startsAt)} — ${formatDate(draft.endsAt)}` : 'Без обмежень'}</small></span></span>
            </div>
          </aside>
        </div>
      </main>
    </div>
  </div>;
}
