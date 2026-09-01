import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { copyToClipboard } from '../lib/banner-generator';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCatalogModification, HoroshopCatalogProduct } from '../types/horoshop-catalog';
import type {
  ProductSelection,
  ProductSelectionInput,
  ProductSelectionItem,
  ProductSelectionPriceMode
} from '../types/product-selection';
import '../styles/product-selection.css';

interface SelectionDraft extends Omit<ProductSelectionInput, 'items'> {
  items: ProductSelectionItem[];
}

type EditorTab = 'appearance' | 'products' | 'preview' | 'install';

function emptyDraft(): SelectionDraft {
  return {
    name: 'Нова вибірка', heading: 'Ми рекомендуємо', priceMode: 'percent', priceValue: 10,
    highlightPromoPrice: true, buttonLabel: 'Купити', desktopColumns: 4, mobileColumns: 2, items: []
  };
}

function localizedTitle(titles: Record<string, string>) {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles).find(Boolean) || '';
}

function offerKey(item: Pick<ProductSelectionItem, 'productExternalId' | 'modificationExternalId'>) {
  return `${item.productExternalId}\0${item.modificationExternalId || ''}`;
}

function isAvailable(value: string | null) {
  const availability = String(value || '').trim().toLocaleLowerCase('uk-UA');
  return Boolean(availability) && !/(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|out[\s-]*of[\s-]*stock|not[\s-]*available|закінчив|отсутств)/iu.test(availability);
}

function productOffer(product: HoroshopCatalogProduct, modification?: HoroshopCatalogModification): ProductSelectionItem {
  return {
    id: `${product.externalId}:${modification?.externalId || 'product'}`,
    productExternalId: product.externalId,
    modificationExternalId: modification?.externalId || null,
    position: 0,
    sku: modification?.sku || product.sku,
    title: localizedTitle(modification?.titles || product.titles) || localizedTitle(product.titles),
    imageUrl: modification?.imageUrl || product.primaryImageUrl || '',
    pageUrl: modification?.pageUrl || product.canonicalUrl || '',
    price: modification?.price || product.price || '',
    oldPrice: modification?.oldPrice || product.oldPrice || '',
    currency: modification?.currency || product.currency || '',
    availability: modification?.availability || product.availability || '',
    visible: modification?.visible ?? product.visible,
    available: isAvailable(modification?.availability || product.availability),
    missing: false
  };
}

function selectionDraft(selection: ProductSelection): SelectionDraft {
  return {
    name: selection.name, heading: selection.heading, priceMode: selection.priceMode,
    priceValue: selection.priceValue, highlightPromoPrice: selection.highlightPromoPrice,
    buttonLabel: selection.buttonLabel, desktopColumns: selection.desktopColumns,
    mobileColumns: selection.mobileColumns, items: selection.items
  };
}

function inputFromDraft(draft: SelectionDraft): ProductSelectionInput {
  return {
    name: draft.name, heading: draft.heading, priceMode: draft.priceMode,
    priceValue: draft.priceMode === 'none' ? 0 : draft.priceValue,
    highlightPromoPrice: draft.highlightPromoPrice, buttonLabel: draft.buttonLabel,
    desktopColumns: draft.desktopColumns, mobileColumns: draft.mobileColumns,
    items: draft.items.map((item) => ({
      productExternalId: item.productExternalId,
      modificationExternalId: item.modificationExternalId
    }))
  };
}

function money(value: string, currency: string) {
  if (!value) return 'Ціна не вказана';
  return `${value}${currency.toUpperCase() === 'UAH' ? ' грн' : currency ? ` ${currency}` : ''}`;
}

function numericPrice(value: string) {
  const match = value.replace(/[\s\u00a0]/gu, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function previewOldPrice(item: ProductSelectionItem, draft: SelectionDraft) {
  const current = numericPrice(item.price);
  if (current === null || current <= 0) return '';
  if (draft.priceMode === 'percent' && draft.priceValue > 0) {
    const rounded = Math.floor((current * (1 + draft.priceValue / 100)) / 10) * 10;
    return String(rounded > current ? rounded : Math.ceil(current / 10) * 10 + 10);
  }
  if (draft.priceMode === 'fixed' && draft.priceValue > 0) {
    return String(Math.round((current + draft.priceValue) * 100) / 100);
  }
  const existing = numericPrice(item.oldPrice);
  return existing !== null && existing > current ? String(existing) : '';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ProductSelectionPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(true);
  const [draft, setDraft] = useState<SelectionDraft>(emptyDraft);
  const [selectionSearch, setSelectionSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [category, setCategory] = useState('');
  const [tab, setTab] = useState<EditorTab>('appearance');

  const selections = useQuery({
    queryKey: ['product-selections', selectionSearch],
    queryFn: () => api.productSelections.list(selectionSearch)
  });
  const selected = useQuery({
    queryKey: ['product-selection', selectedId],
    queryFn: () => api.productSelections.get(selectedId),
    enabled: Boolean(selectedId && !creating)
  });
  const catalog = useQuery({
    queryKey: ['product-selection-catalog', catalogSearch, category],
    queryFn: ({ signal }) => api.productSelections.catalog({ search: catalogSearch, category, page: 1, pageSize: 60 }, signal),
    staleTime: 30_000
  });

  useEffect(() => {
    if (selected.data && !creating) setDraft(selectionDraft(selected.data));
  }, [selected.data, creating]);

  const catalogOffers = useMemo(() => (catalog.data?.items || []).flatMap((product) => {
    const modifications = product.modifications.filter((item) => item.active && item.visible);
    return modifications.length ? modifications.map((item) => productOffer(product, item)) : [productOffer(product)];
  }), [catalog.data?.items]);
  const selectedKeys = useMemo(() => new Set(draft.items.map(offerKey)), [draft.items]);
  const createMutation = useMutation({ mutationFn: api.productSelections.create });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductSelectionInput }) => api.productSelections.update(id, input)
  });
  const removeMutation = useMutation({ mutationFn: api.productSelections.remove });
  const saving = createMutation.isPending || updateMutation.isPending;

  function createNew() {
    setSelectedId(''); setCreating(true); setDraft(emptyDraft()); setTab('appearance');
  }

  function openSelection(selection: ProductSelection) {
    setSelectedId(selection.id); setCreating(false); setTab('appearance');
  }

  function addOffer(offer: ProductSelectionItem) {
    if (selectedKeys.has(offerKey(offer))) return;
    setDraft((current) => ({ ...current, items: [...current.items, { ...offer, position: current.items.length }] }));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.items.length) return;
    setDraft((current) => {
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items: items.map((item, position) => ({ ...item, position })) };
    });
  }

  async function save() {
    try {
      const input = inputFromDraft(draft);
      const saved = creating
        ? await createMutation.mutateAsync(input)
        : await updateMutation.mutateAsync({ id: selectedId, input });
      setSelectedId(saved.id); setCreating(false); setDraft(selectionDraft(saved));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-selections'] }),
        queryClient.invalidateQueries({ queryKey: ['product-selection', saved.id] })
      ]);
      showToast('Вибірку товарів збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти вибірку.', 'error');
    }
  }

  async function remove() {
    if (!selectedId || !await confirm({
      title: 'Видалити вибірку товарів?',
      message: 'Асинхронний код цієї вибірки перестане повертати картки товарів.',
      confirmLabel: 'Видалити', tone: 'danger'
    })) return;
    try {
      await removeMutation.mutateAsync(selectedId);
      await queryClient.invalidateQueries({ queryKey: ['product-selections'] });
      createNew(); showToast('Вибірку видалено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити вибірку.', 'error');
    }
  }

  const publicId = creating ? '' : selected.data?.publicId || '';
  const workspaceOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const pageCode = publicId ? `<script async src="${workspaceOrigin}/api/public/product-selections/${publicId}/embed.js"></script>` : '';
  const globalCode = `<script async data-mt-product-promo-loader src="${workspaceOrigin}/api/public/product-selections/promo-loader.js"></script>`;

  async function copy(value: string, message: string) {
    if (!value) return;
    try { await copyToClipboard(value); showToast(message, 'success'); }
    catch { showToast('Не вдалося скопіювати код.', 'error'); }
  }

  const categoryOptions = [
    { value: '', label: 'Усі категорії' },
    ...(catalog.data?.categories || []).map((item) => ({
      value: item.externalId, label: `${localizedTitle(item.titles) || item.externalId} (${item.productCount})`
    }))
  ];
  const priceModeOptions = [
    { value: 'none', label: 'Без штучної старої ціни' },
    { value: 'percent', label: 'Відсоток до поточної ціни' },
    { value: 'fixed', label: 'Фіксована надбавка' }
  ];
  const tabs: Array<{
    id: EditorTab;
    label: string;
    description: string;
    icon: Parameters<typeof Icon>[0]['name'];
  }> = [
    { id: 'appearance', label: 'Налаштування', description: 'Вигляд і ціна', icon: 'edit' },
    { id: 'products', label: 'Товари', description: `${draft.items.length} у вибірці`, icon: 'catalog' },
    { id: 'preview', label: 'Перегляд', description: 'Готовий блок', icon: 'visibility' },
    { id: 'install', label: 'Встановлення', description: 'Коди Хорошопа', icon: 'copy' }
  ];

  return <div className="product-selection-page">
    <header className="product-selection-header">
      <div className="product-selection-header__copy"><p className="eyebrow">Інструменти Хорошоп</p><h1>Вибірка товарів</h1><p>Зберіть товарний блок із каталогу, перевірте його вигляд і отримайте готовий асинхронний код для Хорошопа.</p></div>
      <button className="button button--primary" type="button" onClick={createNew}><Icon name="add" size={18} /> Нова вибірка</button>
    </header>

    {!catalog.isLoading && !catalog.data?.integration?.configured && <div className="product-selection-connection is-warning"><span><Icon name="integrations" size={20} /></span><div><strong>Хорошоп не підключено</strong><small>Підключіть магазин і синхронізуйте каталог, щоб формувати вибірки.</small></div></div>}
    {catalog.data?.integration?.configured && <div className="product-selection-connection is-connected"><span><Icon name="storefront" size={20} /></span><div><strong>{catalog.data.integration.storeDomain}</strong><small>Каталог синхронізовано · {catalog.data.integration.lastSyncAt ? formatDate(catalog.data.integration.lastSyncAt) : 'очікує першої синхронізації'}</small></div><b><i /> Підключено</b></div>}

    <div className="product-selection-workspace">
      <aside className="product-selection-library">
        <header><div><span><Icon name="productSelection" size={19} /></span><div><small>БІБЛІОТЕКА</small><strong>Збережені вибірки</strong></div></div><button className="icon-button" type="button" onClick={createNew} aria-label="Нова вибірка"><Icon name="add" size={18} /></button></header>
        <div className="product-selection-library__overview"><span><strong>{selections.data?.length || 0}</strong><small>вибірок</small></span><span><strong>{selections.data?.reduce((sum, item) => sum + item.itemCount, 0) || 0}</strong><small>товарів</small></span></div>
        <label className="product-selection-search"><Icon name="search" size={17} /><input value={selectionSearch} onChange={(event) => setSelectionSearch(event.target.value)} placeholder="Знайти вибірку" /></label>
        {selections.isLoading && <p className="product-selection-state">Завантажуємо…</p>}
        {selections.isError && <p className="product-selection-state is-error">Не вдалося завантажити вибірки.</p>}
        {!selections.isLoading && !selections.data?.length && <div className="product-selection-empty"><span><Icon name="productSelection" size={24} /></span><strong>Вибірок ще немає</strong><small>Додайте товари й збережіть перший готовий блок.</small></div>}
        <div className="product-selection-library__items">{selections.data?.map((selection) => <button className={!creating && selectedId === selection.id ? 'is-active' : ''} type="button" key={selection.id} onClick={() => openSelection(selection)}><strong>{selection.name}</strong><small>{selection.itemCount} товарів · {formatDate(selection.updatedAt)}</small></button>)}</div>
        <footer><Icon name="storefront" size={15} /><span>Дані беруться з каталогу Хорошопа</span></footer>
      </aside>

      <main className="product-selection-editor">
        <header className="product-selection-editor__header">
          <div><small>{creating ? 'НОВА ВИБІРКА' : 'РЕДАГУВАННЯ'}</small><input value={draft.name} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="Назва вибірки" /><p>{draft.items.length ? `${draft.items.length} товарів · ${draft.desktopColumns} картки на desktop · ${draft.mobileColumns} ${draft.mobileColumns === 1 ? 'картка' : 'картки'} на mobile` : 'Налаштуйте вигляд і додайте товари з каталогу'}</p></div>
          <div>{!creating && <button className="icon-button icon-button--danger" type="button" onClick={() => void remove()} aria-label="Видалити вибірку"><Icon name="delete" size={18} /></button>}<button className="button button--primary button--small" type="button" onClick={() => void save()} disabled={saving || !draft.name.trim() || !draft.heading.trim() || !draft.items.length || !catalog.data?.integration?.configured}><Icon name="save" size={16} /> {saving ? 'Зберігаємо…' : 'Зберегти'}</button></div>
        </header>

        <nav className="product-selection-tabs" aria-label="Етапи конструктора">{tabs.map((item, index) => <button type="button" className={tab === item.id ? 'is-active' : ''} aria-pressed={tab === item.id} onClick={() => setTab(item.id)} key={item.id}><span>{index + 1}</span><i><Icon name={item.icon} size={18} /></i><span><strong>{item.label}</strong><small>{item.description}</small></span>{item.id === 'products' && <b>{draft.items.length}</b>}</button>)}</nav>

        <div className="product-selection-editor__body">
          {tab === 'appearance' && <div className="product-selection-appearance-layout">
            <section className="product-selection-section">
              <header><span><Icon name="edit" size={18} /></span><div><h2>Вигляд товарного блоку</h2><p>Задайте заголовок, текст кнопки та кількість карток для кожного екрана.</p></div></header>
              <div className="product-selection-settings">
                <label><span>Заголовок блоку</span><input value={draft.heading} onChange={(event) => setDraft((current) => ({ ...current, heading: event.target.value }))} /></label>
                <label><span>Текст кнопки</span><input value={draft.buttonLabel} onChange={(event) => setDraft((current) => ({ ...current, buttonLabel: event.target.value }))} /></label>
                <label><span>Карток на desktop</span><StyledSelect value={String(draft.desktopColumns)} options={[2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} картки` }))} onChange={(value) => setDraft((current) => ({ ...current, desktopColumns: Number(value) }))} ariaLabel="Карток на desktop" /></label>
                <label><span>Карток на mobile</span><StyledSelect value={String(draft.mobileColumns)} options={[1, 2].map((value) => ({ value: String(value), label: value === 1 ? '1 картка' : `${value} картки` }))} onChange={(value) => setDraft((current) => ({ ...current, mobileColumns: Number(value) }))} ariaLabel="Карток на mobile" /></label>
              </div>
            </section>
            <section className="product-selection-section product-selection-promo-settings">
              <header><span><Icon name="productCard" size={18} /></span><div><h2>Косметична стара ціна</h2><p>Це лише візуальний маркетинговий елемент. Ціна кошика залишається актуальною.</p></div></header>
              <div className="product-selection-settings is-promo-grid">
                <label><span>Спосіб розрахунку</span><StyledSelect value={draft.priceMode} options={priceModeOptions} onChange={(value) => setDraft((current) => ({ ...current, priceMode: value as ProductSelectionPriceMode }))} ariaLabel="Режим старої ціни" /></label>
                {draft.priceMode !== 'none' && <label><span>{draft.priceMode === 'percent' ? 'Надбавка, %' : 'Надбавка, грн'}</span><input type="number" min="0.01" step={draft.priceMode === 'percent' ? '0.1' : '1'} value={draft.priceValue} onChange={(event) => setDraft((current) => ({ ...current, priceValue: Number(event.target.value) }))} /></label>}
                <label className="product-selection-checkbox"><input type="checkbox" checked={draft.highlightPromoPrice} onChange={(event) => setDraft((current) => ({ ...current, highlightPromoPrice: event.target.checked }))} /><span><strong>Червона акційна ціна</strong><small>Підсвічувати поточну ціну, коли показується стара.</small></span></label>
              </div>
            </section>
            <aside className="product-selection-help-card"><span><Icon name="check" size={20} /></span><div><strong>Наступний крок</strong><p>Перейдіть до вкладки «Товари» й додайте потрібні позиції із синхронізованого каталогу.</p></div><button className="button button--secondary button--small" type="button" onClick={() => setTab('products')}>Обрати товари <Icon name="arrow" size={15} /></button></aside>
          </div>}

          {tab === 'products' && <div className="product-selection-products-layout">
            <section className="product-selection-section product-selection-catalog-panel">
              <header><span><Icon name="catalog" size={18} /></span><div><h2>Каталог Хорошопа</h2><p>Знайдіть товар або конкретну модифікацію та додайте її до вибірки.</p></div></header>
              <div className="product-selection-catalog-tools"><label><Icon name="search" size={17} /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Назва або артикул" /></label><StyledSelect value={category} options={categoryOptions} onChange={setCategory} ariaLabel="Категорія товару" /></div>
              {catalog.isLoading && <p className="product-selection-state">Шукаємо товари…</p>}
              {catalog.isError && <p className="product-selection-state is-error">Не вдалося завантажити каталог.</p>}
              {!catalog.isLoading && !catalogOffers.length && <p className="product-selection-state">За цими умовами товарів не знайдено.</p>}
              <div className="product-selection-catalog-grid">{catalogOffers.map((offer) => {
                const added = selectedKeys.has(offerKey(offer));
                return <article className={`${!offer.available || !offer.visible ? 'is-unavailable' : ''}${added ? ' is-added' : ''}`} key={offerKey(offer)}><div className="product-selection-thumb">{offer.imageUrl ? <img src={offer.imageUrl} alt="" loading="lazy" /> : <Icon name="productSelection" size={28} />}</div><div><strong>{offer.title || offer.sku}</strong><small>{offer.sku || 'Без артикулу'}</small><span className="product-selection-availability"><i />{offer.availability || 'Статус не вказано'}</span><b>{money(offer.price, offer.currency)}</b></div><button className="button button--secondary button--small" type="button" disabled={added || !offer.available || !offer.visible || !offer.pageUrl || !offer.imageUrl} onClick={() => addOffer(offer)}>{added ? <><Icon name="check" size={14} /> Додано</> : <><Icon name="add" size={14} /> Додати</>}</button></article>;
              })}</div>
            </section>

            <section className="product-selection-section product-selection-selected-panel">
              <header><span><Icon name="productSelection" size={18} /></span><div><h2>Склад вибірки</h2><p>Змініть порядок або приберіть зайві позиції.</p></div><strong className="product-selection-count">{draft.items.length}</strong></header>
              {!draft.items.length && <div className="product-selection-empty is-compact"><span><Icon name="productSelection" size={24} /></span><strong>Вибірка порожня</strong><small>Натисніть «Додати» біля потрібного товару в каталозі.</small></div>}
              <div className="product-selection-selected-list">{draft.items.map((item, index) => <article className={item.missing || !item.available ? 'is-warning' : ''} key={offerKey(item)}><span>{index + 1}</span><div className="product-selection-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon name="productSelection" size={24} />}</div><div><strong>{item.title || item.sku || 'Товар більше не знайдено'}</strong><small>{item.sku} · {item.missing ? 'Відсутній у каталозі' : item.availability}</small><b>{money(item.price, item.currency)}</b></div><div className="product-selection-order"><button type="button" className="icon-button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="Перемістити вище"><Icon name="arrow" size={16} /></button><button type="button" className="icon-button" disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)} aria-label="Перемістити нижче"><Icon name="arrow" size={16} /></button><button type="button" className="icon-button icon-button--danger" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Прибрати товар"><Icon name="delete" size={16} /></button></div></article>)}</div>
              <footer><span>{draft.items.length ? `${draft.items.length} товарів готові до перегляду` : 'Додайте хоча б один товар'}</span><button className="button button--primary button--small" type="button" disabled={!draft.items.length} onClick={() => setTab('preview')}>Переглянути <Icon name="arrow" size={15} /></button></footer>
            </section>
          </div>}

          {tab === 'preview' && <section className="product-selection-section product-selection-preview">
            <header><span><Icon name="visibility" size={18} /></span><div><h2>Попередній перегляд</h2><p>Так виглядатиме блок у новині або статті. Фінальні ціни беруться зі свіжого каталогу.</p></div><button className="button button--secondary button--small" type="button" onClick={() => setTab('products')}>Змінити товари</button></header>
            {!draft.items.length && <div className="product-selection-empty"><span><Icon name="visibility" size={24} /></span><strong>Немає що показувати</strong><small>Спочатку додайте товари у вкладці «Товари».</small></div>}
            {Boolean(draft.items.length) && <div className="product-selection-preview__canvas"><div className="product-selection-preview__browser"><i /><i /><i /><span>mobiletrend.com.ua</span></div><div className="product-selection-preview__content"><h3>{draft.heading}</h3><div className="product-selection-preview__grid" style={{ '--preview-columns': draft.desktopColumns } as CSSProperties}>{draft.items.slice(0, 8).map((item) => {
              const oldPrice = previewOldPrice(item, draft);
              return <article key={offerKey(item)}><div>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon name="productSelection" size={36} />}</div><strong>{item.title || item.sku}</strong><div className="product-selection-preview__price">{oldPrice && <del>{money(oldPrice, item.currency)}</del>}<p className={oldPrice && draft.highlightPromoPrice ? 'is-promo' : ''}>{money(item.price, item.currency)}</p></div><button type="button">{draft.buttonLabel}</button></article>;
            })}</div></div></div>}
            <footer className="product-selection-preview__footer"><span>Вигляд карток адаптується під ширину сторінки Хорошопа.</span><button className="button button--primary button--small" type="button" disabled={!draft.items.length || creating} onClick={() => setTab('install')}>До встановлення <Icon name="arrow" size={15} /></button></footer>
          </section>}

          {tab === 'install' && <div className="product-selection-install">
            <div className="product-selection-install__intro"><span><Icon name={publicId ? 'check' : 'save'} size={22} /></span><div><strong>{publicId ? 'Вибірка готова до встановлення' : 'Спочатку збережіть вибірку'}</strong><p>{publicId ? 'Скопіюйте код сторінки та переконайтеся, що глобальний loader встановлено в обох шаблонах Хорошопа.' : 'Після збереження тут з’явиться персональний async-код цієї вибірки.'}</p></div></div>
            <section className="product-selection-section product-selection-code">
              <header><span><Icon name="copy" size={18} /></span><div><h2>1. Код сторінки</h2><p>Вставте у режим «Джерело» потрібної новини або статті Хорошопа.</p></div><button className="button button--secondary button--small" type="button" disabled={!pageCode} onClick={() => void copy(pageCode, 'Код вибірки скопійовано.')}><Icon name="copy" size={16} /> Копіювати</button></header>
              <textarea value={pageCode || 'Код буде доступний після збереження вибірки.'} readOnly spellCheck={false} />
            </section>
            <section className="product-selection-section product-selection-code">
              <header><span><Icon name="copy" size={18} /></span><div><h2>2. Глобальний promo loader</h2><p>Встановіть один раз окремо у desktop- і mobile-шаблон. Без <code>mt_promo</code> loader нічого не змінює.</p></div><button className="button button--secondary button--small" type="button" onClick={() => void copy(globalCode, 'Глобальний promo loader скопійовано.')}><Icon name="copy" size={16} /> Копіювати</button></header>
              <textarea value={globalCode} readOnly spellCheck={false} />
            </section>
          </div>}
        </div>
      </main>
    </div>
  </div>;
}
