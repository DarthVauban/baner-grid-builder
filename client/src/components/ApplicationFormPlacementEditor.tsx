import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  ApplicationForm,
  ApplicationFormCampaign,
  ApplicationFormCampaignInput,
  ApplicationFormCampaignInsertPosition,
  ApplicationFormCampaignTarget,
  ApplicationFormCampaignTargetMode
} from '../types/application';
import type { HoroshopCatalogModification, HoroshopCatalogProduct } from '../types/horoshop-catalog';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

interface Props {
  forms: ApplicationForm[];
}

interface TargetDraft {
  productId: string;
  modificationId: string | null;
  title: string;
  sku: string;
}

type AvailabilityTone = 'available' | 'waiting' | 'unavailable' | 'unknown';
type PlacementEditorTab = 'design' | 'display' | 'products' | 'stickers' | 'categories';

const positionOptions = [
  { value: 'end' as const, label: 'В кінці контейнера' },
  { value: 'start' as const, label: 'На початку контейнера' },
  { value: 'after' as const, label: 'Після контейнера' },
  { value: 'before' as const, label: 'Перед контейнером' }
];

function firstTitle(titles: Record<string, string>, fallback = 'Товар без назви') {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback;
}

function availabilityFor(value: string | null | undefined, active = true): { label: string; tone: AvailabilityTone } {
  if (!active) return { label: 'Неактивний', tone: 'unavailable' };
  const label = value?.trim();
  if (!label) return { label: 'Наявність не вказана', tone: 'unknown' };
  const normalized = label.toLocaleLowerCase('uk-UA');
  if (/немає|відсут|нет\s+в\s+налич|out\s+of\s+stock|not\s+available|^0$/u.test(normalized)) {
    return { label, tone: 'unavailable' };
  }
  if (/очік|під\s+замовлення|предзаказ|preorder|wait/u.test(normalized)) {
    return { label, tone: 'waiting' };
  }
  return { label, tone: 'available' };
}

function productAvailability(product: HoroshopCatalogProduct) {
  const statuses = (product.modifications.length > 0 ? product.modifications : [product])
    .map((item) => availabilityFor(item.availability, item.active));
  if (statuses.some((status) => status.tone === 'available')) return { label: 'Є в наявності', tone: 'available' as const };
  if (statuses.some((status) => status.tone === 'waiting')) return { label: 'Очікується', tone: 'waiting' as const };
  if (statuses.length > 0 && statuses.every((status) => status.tone === 'unavailable')) return { label: 'Немає в наявності', tone: 'unavailable' as const };
  return { label: 'Наявність не вказана', tone: 'unknown' as const };
}

function numericPrice(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/gu, '').replace(',', '.').replace(/[^\d.-]/gu, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: string | number | null | undefined, currency = 'UAH') {
  const amount = typeof value === 'number' ? value : numericPrice(value);
  if (amount === null) return '—';
  const formatted = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(amount);
  const normalizedCurrency = currency.toUpperCase();
  return normalizedCurrency === 'UAH' || normalizedCurrency === 'ГРН' ? `${formatted} грн` : `${formatted} ${currency}`;
}

function productPrice(product: HoroshopCatalogProduct) {
  const prices = product.modifications
    .map((modification) => numericPrice(modification.price))
    .filter((price): price is number => price !== null);
  if (prices.length === 0) return formatPrice(product.price, product.currency || 'UAH');
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return `${minimum < maximum ? 'від ' : ''}${formatPrice(minimum, product.currency || product.modifications[0]?.currency || 'UAH')}`;
}

function targetKey(target: Pick<TargetDraft, 'productId' | 'modificationId'>) {
  return `${target.productId}:${target.modificationId || '*'}`;
}

function fromSavedTarget(target: ApplicationFormCampaignTarget): TargetDraft {
  return {
    productId: target.productId,
    modificationId: target.modificationId,
    title: target.title,
    sku: target.sku
  };
}

function emptyCampaign(form: ApplicationForm): ApplicationFormCampaignInput {
  return {
    formId: form.id,
    name: `Кнопка · ${form.name}`,
    priority: 100,
    buttonText: 'Передзамовити',
    buttonStyles: {
      backgroundColor: '#6d5dfc', color: '#ffffff', borderRadius: '12px',
      padding: '12px 18px', fontWeight: '700', fontSize: '16px'
    },
    placement: {
      desktop: { selector: '.product-order__row', insertPosition: 'end' },
      mobile: { selector: '.product-order__row', insertPosition: 'end' }
    },
    availabilityMode: 'all',
    targetMode: 'products',
    categoryExternalId: null,
    stickerExternalId: null,
    startsAt: null,
    endsAt: null,
    targets: []
  };
}

function campaignInput(campaign: ApplicationFormCampaign): ApplicationFormCampaignInput {
  return {
    formId: campaign.formId,
    name: campaign.name,
    priority: campaign.priority,
    buttonText: campaign.buttonText,
    buttonStyles: campaign.buttonStyles,
    placement: campaign.placement,
    availabilityMode: campaign.availabilityMode,
    targetMode: campaign.targetMode,
    categoryExternalId: campaign.categoryExternalId,
    stickerExternalId: campaign.stickerExternalId,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    targets: campaign.targets.map((target) => ({ productId: target.productId, modificationId: target.modificationId }))
  };
}

function statusLabel(status: ApplicationFormCampaign['status']) {
  if (status === 'active') return 'Активна';
  if (status === 'paused') return 'На паузі';
  return 'Чернетка';
}

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function colorInputValue(value: string | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/iu.test(value || '') ? value as string : fallback;
}

function fontSizeInputValue(value: string | undefined) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)px$/u);
  return match ? match[1] : '16';
}

function selectionTabForMode(mode: ApplicationFormCampaignTargetMode): PlacementEditorTab | null {
  if (mode === 'products') return 'products';
  if (mode === 'sticker') return 'stickers';
  if (mode === 'category') return 'categories';
  return null;
}

export function ApplicationFormPlacementEditor({ forms }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlacementEditorTab>('design');
  const publishedForms = forms.filter((candidate) => candidate.status === 'published');
  const [draft, setDraft] = useState<ApplicationFormCampaignInput>(() => emptyCampaign(publishedForms[0]));
  const [selectedTargets, setSelectedTargets] = useState<TargetDraft[]>([]);
  const [search, setSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [page, setPage] = useState(1);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(() => new Set());
  const deferredSearch = useDeferredValue(search);

  const campaigns = useQuery({
    queryKey: ['form-campaigns'],
    queryFn: () => api.formCampaigns.list()
  });
  const catalog = useQuery({
    queryKey: ['form-campaign-catalog', deferredSearch, catalogCategory, page],
    queryFn: ({ signal }) => api.formCampaigns.catalog({ search: deferredSearch, category: catalogCategory, page, pageSize: 20 }, signal)
  });
  const embedCode = useQuery({ queryKey: ['form-campaign-embed-code'], queryFn: api.formCampaigns.embedCode });
  const selectedCampaign = useMemo(
    () => campaigns.data?.find((campaign) => campaign.id === selectedId) || null,
    [campaigns.data, selectedId]
  );
  const selectedForm = forms.find((candidate) => candidate.id === draft.formId) || null;

  const createCampaign = useMutation({ mutationFn: api.formCampaigns.create });
  const updateCampaign = useMutation({ mutationFn: ({ id, input }: { id: string; input: ApplicationFormCampaignInput }) => api.formCampaigns.update(id, input) });
  const updateStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: ApplicationFormCampaign['status'] }) => api.formCampaigns.setStatus(id, status) });
  const archiveCampaign = useMutation({ mutationFn: api.formCampaigns.archive });
  const busy = createCampaign.isPending || updateCampaign.isPending || updateStatus.isPending || archiveCampaign.isPending;

  function openCampaign(campaign: ApplicationFormCampaign) {
    setSelectedId(campaign.id);
    const input = campaignInput(campaign);
    setDraft(publishedForms.some((candidate) => candidate.id === input.formId) ? input : { ...input, formId: '' });
    setSelectedTargets(campaign.targets.map(fromSavedTarget));
    setActiveTab('design');
  }

  function createNew() {
    setSelectedId(null);
    setDraft(emptyCampaign(publishedForms[0]));
    setSelectedTargets([]);
    setActiveTab('design');
  }

  function patchPlacement(device: 'desktop' | 'mobile', patch: Partial<{ selector: string; insertPosition: ApplicationFormCampaignInsertPosition }>) {
    setDraft((current) => ({
      ...current,
      placement: {
        ...current.placement,
        [device]: { ...current.placement[device], ...patch }
      }
    }));
  }

  function changeTargetMode(targetMode: ApplicationFormCampaignTargetMode) {
    setDraft((current) => ({
      ...current,
      targetMode,
      categoryExternalId: targetMode === 'category' ? current.categoryExternalId : null,
      stickerExternalId: targetMode === 'sticker' ? current.stickerExternalId : null
    }));
    if (!selectionTabForMode(targetMode) && !['design', 'display'].includes(activeTab)) setActiveTab('display');
  }

  function toggleTarget(target: TargetDraft) {
    setSelectedTargets((current) => {
      const key = targetKey(target);
      if (current.some((item) => targetKey(item) === key)) return current.filter((item) => targetKey(item) !== key);
      if (!target.modificationId) return [
        ...current.filter((item) => item.productId !== target.productId),
        target
      ];
      return [
        ...current.filter((item) => !(item.productId === target.productId && !item.modificationId)),
        target
      ];
    });
  }

  function productTarget(product: HoroshopCatalogProduct): TargetDraft {
    return { productId: product.id, modificationId: null, title: firstTitle(product.titles), sku: product.sku };
  }

  function modificationTarget(product: HoroshopCatalogProduct, modification: HoroshopCatalogModification): TargetDraft {
    return {
      productId: product.id,
      modificationId: modification.id,
      title: firstTitle(modification.titles, firstTitle(product.titles)),
      sku: modification.sku || product.sku
    };
  }

  function isTargetSelected(target: TargetDraft) {
    return selectedTargets.some((item) => targetKey(item) === targetKey(target));
  }

  function toggleProduct(productId: string) {
    setExpandedProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['form-campaigns'] });
  }

  async function save() {
    const input = {
      ...draft,
      targets: draft.targetMode === 'products'
        ? selectedTargets.map((target) => ({ productId: target.productId, modificationId: target.modificationId }))
        : []
    };
    try {
      const saved = selectedId
        ? await updateCampaign.mutateAsync({ id: selectedId, input })
        : await createCampaign.mutateAsync(input);
      setSelectedId(saved.id);
      setDraft(campaignInput(saved));
      setSelectedTargets(saved.targets.map(fromSavedTarget));
      showToast(selectedId ? 'Кнопку оновлено.' : 'Кнопку створено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти кнопку.', 'error');
    }
  }

  async function setStatus(status: ApplicationFormCampaign['status']) {
    if (!selectedCampaign) return;
    try {
      const updated = await updateStatus.mutateAsync({ id: selectedCampaign.id, status });
      openCampaign(updated);
      showToast(status === 'active' ? 'Кнопку активовано.' : 'Статус кнопки оновлено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function archive() {
    if (!selectedCampaign) return;
    const confirmed = await confirm({
      title: 'Архівувати кнопку?',
      message: `Кнопка «${selectedCampaign.name}» більше не показуватиметься на сайті.`,
      confirmLabel: 'Архівувати',
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      await archiveCampaign.mutateAsync(selectedCampaign.id);
      createNew();
      showToast('Кнопку перенесено в архів.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося архівувати кнопку.', 'error');
    }
  }

  async function copyEmbedCode() {
    if (!embedCode.data?.code) return;
    try {
      await navigator.clipboard.writeText(embedCode.data.code);
      showToast('Код вставки скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  const categoryOptions = [
    { value: '', label: 'Усі категорії' },
    ...(catalog.data?.categories || []).map((item) => ({ value: item.externalId, label: firstTitle(item.titles) }))
  ];
  const targetModeOptions = [
    { value: 'all_products' as const, label: 'На всіх товарах' },
    { value: 'products' as const, label: 'На конкретних товарах або модифікаціях' },
    { value: 'sticker' as const, label: 'На товарах зі стікером' },
    { value: 'category' as const, label: 'У певній категорії' }
  ];
  const formOptions = [
    { value: '', label: 'Оберіть опубліковану форму' },
    ...publishedForms.map((candidate) => ({ value: candidate.id, label: candidate.name }))
  ];
  const stickerOptions = [
    { value: '', label: 'Оберіть стікер' },
    ...(catalog.data?.stickers || []).map((sticker) => ({ value: sticker.externalId, label: sticker.title }))
  ];
  const targetCategoryOptions = [
    { value: '', label: 'Оберіть категорію' },
    ...(catalog.data?.categories || []).map((item) => ({ value: item.externalId, label: firstTitle(item.titles) }))
  ];
  const targetSummary = (campaign: ApplicationFormCampaign) => {
    if (campaign.targetMode === 'all_products') return 'Усі товари';
    if (campaign.targetMode === 'category') {
      const targetCategory = catalog.data?.categories.find((item) => item.externalId === campaign.categoryExternalId);
      return `Категорія: ${targetCategory ? firstTitle(targetCategory.titles) : campaign.categoryExternalId || '—'}`;
    }
    if (campaign.targetMode === 'sticker') {
      const targetSticker = catalog.data?.stickers?.find((item) => item.externalId === campaign.stickerExternalId);
      return `Стікер: ${targetSticker?.title || campaign.stickerExternalId || '—'}`;
    }
    return `${campaign.targets.length} товарів / модифікацій`;
  };
  const targetingComplete = draft.targetMode === 'all_products'
    || (draft.targetMode === 'products' && selectedTargets.length > 0)
    || (draft.targetMode === 'category' && Boolean(draft.categoryExternalId))
    || (draft.targetMode === 'sticker' && Boolean(draft.stickerExternalId));
  const selectionTab = selectionTabForMode(draft.targetMode);
  const targetModeLabel = targetModeOptions.find((option) => option.value === draft.targetMode)?.label || 'Правило не вибрано';
  const selectedSticker = catalog.data?.stickers?.find((item) => item.externalId === draft.stickerExternalId) || null;
  const selectedCategory = catalog.data?.categories.find((item) => item.externalId === draft.categoryExternalId) || null;
  const selectionTabCopy = selectionTab === 'products'
    ? { label: 'Вибір товарів', summary: `${selectedTargets.length} обрано`, icon: 'productSelection' as const }
    : selectionTab === 'stickers'
      ? { label: 'Вибір стікера', summary: selectedSticker?.title || 'Не вибрано', icon: 'brands' as const }
      : selectionTab === 'categories'
        ? { label: 'Вибір категорії', summary: selectedCategory ? firstTitle(selectedCategory.titles) : 'Не вибрано', icon: 'catalog' as const }
        : null;

  return <div className="form-placement-editor">
    <div className="form-placement-editor__top">
      <section className="tool-panel form-placement-editor__library">
        <header className="tool-panel__header">
          <div><p className="eyebrow">Бібліотека</p><h2>Кнопки форм</h2></div>
          <button className="button button--primary button--small" type="button" onClick={createNew}><Icon name="add" size={15} /> Нова кнопка</button>
        </header>
        <p className="form-placement-editor__hint">Кожна кнопка викликає обрану просту форму та має власні правила показу у каталозі.</p>
        <div className="form-placement-campaign-list">
          {(campaigns.data || []).map((campaign) => <button className={selectedId === campaign.id ? 'is-active' : ''} type="button" key={campaign.id} onClick={() => openCampaign(campaign)}>
            <span><strong>{campaign.name}</strong><small>{campaign.formName} · {targetSummary(campaign)} · {statusLabel(campaign.status)}</small></span>
            <i className={`form-placement-status form-placement-status--${campaign.status}`} />
          </button>)}
          {!campaigns.isLoading && !campaigns.data?.length && <p>Кнопок ще немає. Створіть першу та прив’яжіть її до форми.</p>}
        </div>
        <div className="form-placement-embed">
          <span><strong>Єдиний код для магазину</strong><small>Вставте один раз. Цільові товари керуються звідси.</small></span>
          <button className="button button--secondary button--small" type="button" disabled={!embedCode.data?.code} onClick={() => void copyEmbedCode()}><Icon name="copy" size={15} /> Скопіювати</button>
        </div>
      </section>

      <section className="tool-panel form-placement-editor__settings">
        <header className="tool-panel__header"><div><p className="eyebrow">Налаштування</p><h2>{selectedCampaign ? selectedCampaign.name : 'Нова кнопка'}</h2></div>{selectedCampaign && <span className={`status-pill status-pill--${selectedCampaign.status}`}>{statusLabel(selectedCampaign.status)}</span>}</header>
        {selectedForm?.status !== 'published' && <div className="form-message form-message--warning">Оберіть опубліковану форму, яку має викликати кнопка.</div>}
        <nav className="form-placement-editor-tabs" role="tablist" aria-label="Розділи налаштування кнопки">
          <button id="form-placement-tab-design" className={activeTab === 'design' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'design'} aria-controls="form-placement-panel-design" onClick={() => setActiveTab('design')}>
            <span className="form-placement-editor-tabs__number">1</span><span className="form-placement-editor-tabs__icon"><Icon name="productCard" size={18} /></span><span className="form-placement-editor-tabs__copy"><strong>Налаштування дизайну</strong><small>{draft.buttonText || 'Без тексту'} · {fontSizeInputValue(draft.buttonStyles.fontSize)} px</small></span>
          </button>
          <button id="form-placement-tab-display" className={activeTab === 'display' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'display'} aria-controls="form-placement-panel-display" onClick={() => setActiveTab('display')}>
            <span className="form-placement-editor-tabs__number">2</span><span className="form-placement-editor-tabs__icon"><Icon name="visibility" size={18} /></span><span className="form-placement-editor-tabs__copy"><strong>Налаштування відображення</strong><small>{targetModeLabel}</small></span>
          </button>
          {selectionTab && selectionTabCopy && <button id={`form-placement-tab-${selectionTab}`} className={activeTab === selectionTab ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === selectionTab} aria-controls={`form-placement-panel-${selectionTab}`} onClick={() => setActiveTab(selectionTab)}>
            <span className="form-placement-editor-tabs__number">3</span><span className="form-placement-editor-tabs__icon"><Icon name={selectionTabCopy.icon} size={18} /></span><span className="form-placement-editor-tabs__copy"><strong>{selectionTabCopy.label}</strong><small>{selectionTabCopy.summary}</small></span>
          </button>}
        </nav>

        {activeTab === 'design' && <section className="form-placement-tab-panel" id="form-placement-panel-design" role="tabpanel" aria-labelledby="form-placement-tab-design">
          <div className="form-placement-settings-block">
            <header className="form-placement-section-heading"><span><Icon name="formBuilder" size={18} /></span><div><h3>Форма та назва</h3><p>Оберіть опубліковану форму та назвіть кнопку для команди.</p></div></header>
            <div className="form-builder-grid">
              <div className="field form-builder-grid__wide"><span>Яку форму відкривати</span><StyledSelect value={draft.formId} options={formOptions} onChange={(formId) => setDraft({ ...draft, formId })} ariaLabel="Форма для кнопки" /></div>
              <label className="field form-builder-grid__wide"><span>Назва кнопки в робочому просторі</span><input value={draft.name} maxLength={160} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            </div>
          </div>
          <div className="form-placement-settings-block">
            <header className="form-placement-section-heading"><span><Icon name="productCard" size={18} /></span><div><h3>Вигляд кнопки</h3><p>Налаштуйте текст, кольори та розмір шрифту.</p></div></header>
            <div className="form-builder-grid">
              <label className="field form-builder-grid__wide"><span>Текст кнопки</span><input value={draft.buttonText} maxLength={120} onChange={(event) => setDraft({ ...draft, buttonText: event.target.value })} /></label>
              <label className="field"><span>Колір кнопки</span><input type="color" value={colorInputValue(draft.buttonStyles.backgroundColor, '#6d5dfc')} onChange={(event) => setDraft({ ...draft, buttonStyles: { ...draft.buttonStyles, backgroundColor: event.target.value } })} /></label>
              <label className="field"><span>Колір тексту кнопки</span><input type="color" value={colorInputValue(draft.buttonStyles.color, '#ffffff')} onChange={(event) => setDraft({ ...draft, buttonStyles: { ...draft.buttonStyles, color: event.target.value } })} /></label>
              <label className="field form-builder-grid__wide"><span>Розмір шрифту кнопки, px</span><input type="number" min={8} max={48} step={1} value={fontSizeInputValue(draft.buttonStyles.fontSize)} onChange={(event) => setDraft({ ...draft, buttonStyles: { ...draft.buttonStyles, fontSize: `${event.target.value || 16}px` } })} /></label>
            </div>
            <div className="button-live-preview form-placement-button-preview"><span>Живий вигляд</span><button type="button" style={{ ...draft.buttonStyles, border: 0, cursor: 'default' }}>{draft.buttonText || 'Передзамовити'}</button></div>
          </div>
        </section>}

        {activeTab === 'display' && <section className="form-placement-tab-panel" id="form-placement-panel-display" role="tabpanel" aria-labelledby="form-placement-tab-display">
          <div className="form-placement-settings-block">
            <header className="form-placement-section-heading"><span><Icon name="visibility" size={18} /></span><div><h3>Правила показу</h3><p>Визначте, для яких товарів і за якої наявності з’являється кнопка.</p></div></header>
            <div className="form-builder-grid">
              <div className="field form-builder-grid__wide"><span>Де показувати кнопку</span><StyledSelect value={draft.targetMode} options={targetModeOptions} onChange={changeTargetMode} ariaLabel="Правило показу кнопки" /></div>
              <div className="field"><span>Коли показувати</span><StyledSelect value={draft.availabilityMode} options={[{ value: 'all', label: 'Завжди на цільовому товарі' }, { value: 'out_of_stock', label: 'Лише коли немає в наявності' }]} onChange={(availabilityMode) => setDraft({ ...draft, availabilityMode })} ariaLabel="Умова наявності" /></div>
              <label className="field"><span>Пріоритет</span><input type="number" min={0} max={1000} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) || 0 })} /></label>
            </div>
            {selectionTab && selectionTabCopy && <button className="form-placement-context-link" type="button" onClick={() => setActiveTab(selectionTab)}>
              <span><Icon name={selectionTabCopy.icon} size={18} /></span><span><strong>{selectionTabCopy.label}</strong><small>{selectionTabCopy.summary}</small></span><Icon name="arrow" size={18} />
            </button>}
          </div>
          <div className="form-placement-settings-block">
            <header className="form-placement-section-heading"><span><Icon name="schedule" size={18} /></span><div><h3>Розклад показу</h3><p>Залиште поля порожніми, якщо кнопка не має обмежень за часом.</p></div></header>
            <div className="form-builder-grid">
              <label className="field"><span>Початок показу</span><input type="datetime-local" value={toLocalDateTime(draft.startsAt)} onChange={(event) => setDraft({ ...draft, startsAt: fromLocalDateTime(event.target.value) })} /></label>
              <label className="field"><span>Завершення показу</span><input type="datetime-local" value={toLocalDateTime(draft.endsAt)} onChange={(event) => setDraft({ ...draft, endsAt: fromLocalDateTime(event.target.value) })} /></label>
            </div>
          </div>
          <div className="form-placement-settings-block">
            <header className="form-placement-section-heading"><span><Icon name="productPage" size={18} /></span><div><h3>Розміщення на сторінці</h3><p>Налаштуйте окремі точки вставки для комп’ютерної та мобільної версій.</p></div></header>
            <div className="form-placement-device-grid">
              {(['desktop', 'mobile'] as const).map((device) => <article key={device}>
                <header><Icon name={device === 'desktop' ? 'productPage' : 'phone'} size={17} /><strong>{device === 'desktop' ? 'Комп’ютер' : 'Мобільний'}</strong></header>
                <label className="field"><span>CSS-селектор контейнера</span><input value={draft.placement[device].selector} onChange={(event) => patchPlacement(device, { selector: event.target.value })} /></label>
                <div className="field"><span>Позиція</span><StyledSelect value={draft.placement[device].insertPosition} options={positionOptions} onChange={(insertPosition) => patchPlacement(device, { insertPosition })} ariaLabel={`Позиція на ${device}`} /></div>
              </article>)}
            </div>
          </div>
        </section>}

        {activeTab === 'products' && selectionTab === 'products' && <section className="form-placement-tab-panel form-placement-editor__catalog" id="form-placement-panel-products" role="tabpanel" aria-labelledby="form-placement-tab-products">
          <header className="form-placement-section-heading form-placement-section-heading--apart"><span><Icon name="productSelection" size={18} /></span><div><h3>Товари і модифікації</h3><p>Ціль «увесь товар» охоплює всі його модифікації. Обрана модифікація працює лише для свого SKU.</p></div><b className="form-placement-target-count">{selectedTargets.length} обрано</b></header>
          {catalog.data && !catalog.data.integration.configured && <div className="form-message form-message--warning">Підключіть і синхронізуйте Хорошоп, щоб обрати товари для передзамовлення.</div>}
          {selectedTargets.length > 0 && <div className="form-placement-selected-targets">{selectedTargets.map((target) => <button type="button" key={targetKey(target)} onClick={() => toggleTarget(target)} title="Вилучити"><span>{target.title}</span><small>{target.modificationId ? target.sku : 'Усі модифікації'}</small><Icon name="close" size={13} /></button>)}</div>}
          <div className="form-placement-catalog-toolbar">
            <label className="task-search"><Icon name="search" size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Назва або SKU" /></label>
            <StyledSelect value={catalogCategory} options={categoryOptions} onChange={(value) => { setCatalogCategory(value); setPage(1); }} ariaLabel="Категорія товару" />
          </div>
          {catalog.isLoading && <div className="task-list-state"><p>Завантажуємо каталог Хорошоп...</p></div>}
          {catalog.isError && <div className="form-message form-message--error">{catalog.error instanceof Error ? catalog.error.message : 'Не вдалося завантажити каталог.'}</div>}
          <div className="form-placement-product-tree" role="tree" aria-label="Товари з модифікаціями">
            {(catalog.data?.items || []).map((product) => {
              const parentTarget = productTarget(product);
              const title = firstTitle(product.titles);
              const hasModifications = product.modifications.length > 1;
              const expanded = hasModifications && expandedProducts.has(product.id);
              const branchId = `form-placement-modifications-${product.id}`;
              const availability = productAvailability(product);
              return <article className={`form-placement-product-node${expanded ? ' is-expanded' : ''}`} key={product.id} role="treeitem" aria-level={1} aria-expanded={hasModifications ? expanded : undefined}>
                <div className="form-placement-product-row form-placement-product-row--parent">
                  {hasModifications ? <button className="form-placement-product-toggle" type="button" aria-controls={branchId} aria-expanded={expanded} aria-label={`${expanded ? 'Згорнути' : 'Розгорнути'} модифікації ${title}`} onClick={() => toggleProduct(product.id)}>
                    <Icon name={expanded ? 'arrowDown' : 'arrow'} size={20} />
                  </button> : <span className="form-placement-product-toggle-spacer" />}
                  <div className="form-placement-product-main">
                    <span className="form-placement-product-image">{product.primaryImageUrl ? <img src={product.primaryImageUrl} alt="" loading="lazy" /> : <Icon name="productSelection" size={20} />}</span>
                    <span className="form-placement-product-copy"><strong title={title}>{title}</strong><small>{product.brand || 'Без бренду'} · <code>{product.sku || '—'}</code></small></span>
                  </div>
                  <span className="form-placement-product-price"><small>Ціна</small><strong>{productPrice(product)}</strong></span>
                  <span className={`form-placement-availability form-placement-availability--${availability.tone}`}><i />{availability.label}</span>
                  <label className="check-field form-placement-product-select"><input type="checkbox" checked={isTargetSelected(parentTarget)} onChange={() => toggleTarget(parentTarget)} /><span>Увесь товар</span></label>
                  {hasModifications ? <button className="form-placement-modifications-button" type="button" aria-controls={branchId} aria-expanded={expanded} onClick={() => toggleProduct(product.id)}><Icon name="variants" size={17} /> Модифікації <b>{product.modifications.length}</b></button> : <span className="form-placement-modifications-spacer" />}
                </div>
                {hasModifications && expanded && <div className="form-placement-product-branches" id={branchId} role="group">{product.modifications.map((modification, index) => {
                  const target = modificationTarget(product, modification);
                  const modificationTitle = firstTitle(modification.titles, title);
                  const modificationAvailability = availabilityFor(modification.availability, modification.active);
                  return <div className="form-placement-product-row form-placement-product-row--modification" key={modification.id} role="treeitem" aria-level={2}>
                    <span className="form-placement-product-joint" aria-hidden="true" />
                    <div className="form-placement-product-main">
                      <span className="form-placement-product-image form-placement-product-image--small">{modification.imageUrl || product.primaryImageUrl ? <img src={modification.imageUrl || product.primaryImageUrl || ''} alt="" loading="lazy" /> : <Icon name="productSelection" size={18} />}</span>
                      <span className="form-placement-product-copy"><strong title={modificationTitle}>{modificationTitle}</strong><small>Модифікація {index + 1} · <code>{modification.sku || '—'}</code></small></span>
                    </div>
                    <span className="form-placement-product-price"><small>Ціна</small><strong>{formatPrice(modification.price, modification.currency || product.currency || 'UAH')}</strong></span>
                    <span className={`form-placement-availability form-placement-availability--${modificationAvailability.tone}`}><i />{modificationAvailability.label}</span>
                    <label className="check-field form-placement-product-select"><input type="checkbox" checked={isTargetSelected(target)} onChange={() => toggleTarget(target)} aria-label={`Обрати модифікацію ${modificationTitle}`} /><span>Обрати</span></label>
                  </div>;
                })}</div>}
              </article>;
            })}
            {!catalog.isLoading && !catalog.data?.items.length && <p>За фільтрами товарів не знайдено.</p>}
          </div>
          {(catalog.data?.pageCount || 0) > 1 && <footer className="application-pagination"><span>{catalog.data?.total || 0} товарів</span><div><button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Назад</button><span>{page} / {catalog.data?.pageCount}</span><button className="button button--secondary button--small" type="button" disabled={page >= (catalog.data?.pageCount || 1)} onClick={() => setPage((current) => current + 1)}>Далі</button></div></footer>}
        </section>}

        {activeTab === 'stickers' && selectionTab === 'stickers' && <section className="form-placement-tab-panel" id="form-placement-panel-stickers" role="tabpanel" aria-labelledby="form-placement-tab-stickers">
          <div className="form-placement-target-picker">
            <header className="form-placement-section-heading"><span><Icon name="brands" size={18} /></span><div><h3>Стікер товару</h3><p>Кнопка з’явиться на товарах, яким у Хорошоп призначено обраний стікер.</p></div></header>
            {catalog.data && !catalog.data.integration.configured && <div className="form-message form-message--warning">Підключіть і синхронізуйте Хорошоп, щоб обрати стікер.</div>}
            <div className="field"><span>Оберіть стікер</span><StyledSelect value={draft.stickerExternalId || ''} options={stickerOptions} onChange={(stickerExternalId) => setDraft({ ...draft, stickerExternalId: stickerExternalId || null })} ariaLabel="Цільовий стікер" /></div>
            {selectedSticker && <div className="form-placement-current-target"><span><Icon name="check" size={18} /></span><div><small>Обраний стікер</small><strong>{selectedSticker.title}</strong></div></div>}
          </div>
        </section>}

        {activeTab === 'categories' && selectionTab === 'categories' && <section className="form-placement-tab-panel" id="form-placement-panel-categories" role="tabpanel" aria-labelledby="form-placement-tab-categories">
          <div className="form-placement-target-picker">
            <header className="form-placement-section-heading"><span><Icon name="catalog" size={18} /></span><div><h3>Категорія товарів</h3><p>Кнопка з’явиться на товарах з обраної категорії каталогу Хорошоп.</p></div></header>
            {catalog.data && !catalog.data.integration.configured && <div className="form-message form-message--warning">Підключіть і синхронізуйте Хорошоп, щоб обрати категорію.</div>}
            <div className="field"><span>Оберіть категорію</span><StyledSelect value={draft.categoryExternalId || ''} options={targetCategoryOptions} onChange={(categoryExternalId) => setDraft({ ...draft, categoryExternalId: categoryExternalId || null })} ariaLabel="Цільова категорія" /></div>
            {selectedCategory && <div className="form-placement-current-target"><span><Icon name="check" size={18} /></span><div><small>Обрана категорія</small><strong>{firstTitle(selectedCategory.titles)}</strong></div></div>}
          </div>
        </section>}

        <footer className="form-builder-actions">
          <button className="button button--primary" type="button" disabled={busy || selectedForm?.status !== 'published' || !draft.name.trim() || !targetingComplete} onClick={() => void save()}>{selectedId ? 'Зберегти зміни' : 'Створити кнопку'}</button>
          {selectedCampaign?.status !== 'active' && selectedCampaign && <button className="button button--secondary" type="button" disabled={busy || selectedForm?.status !== 'published'} onClick={() => void setStatus('active')}>Активувати</button>}
          {selectedCampaign?.status === 'active' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void setStatus('paused')}>Призупинити</button>}
          {selectedCampaign && <button className="button button--danger" type="button" disabled={busy} onClick={() => void archive()}>Архівувати</button>}
        </footer>
      </section>
    </div>
  </div>;
}
