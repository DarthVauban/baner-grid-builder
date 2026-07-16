import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import {
  catalogConditionOptions,
  catalogPublicationStatusOptions,
  emptyCatalogProductInput,
  formatCatalogDate,
  productToInput
} from '../lib/catalog';
import { convertCatalogImageToWebp, validateCatalogImageFile } from '../lib/catalog-media';
import { copyShareLink } from '../lib/share';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogAvailabilityStatus,
  CatalogBrand,
  CatalogBrandDirectory,
  CatalogCharacteristicField,
  CatalogCharacteristicTemplate,
  CatalogCondition,
  CatalogFeed,
  CatalogImportPreview,
  CatalogProduct,
  CatalogProductGroupItem,
  CatalogProductModificationSet,
  CatalogProductGroup,
  CatalogProductInput,
  CatalogPublicationStatus,
  CatalogSummary
} from '../types/catalog';

const conditionFilterOptions = [
  { value: 'all', label: 'Усі стани' },
  ...catalogConditionOptions
];
const statusFilterOptions = [
  { value: 'all', label: 'Усі статуси' },
  ...catalogPublicationStatusOptions
];
const availabilityFilterOptions: Array<{ value: CatalogAvailabilityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Уся наявність' },
  { value: 'in_stock', label: 'В наявності' },
  { value: 'incoming', label: 'В дорозі' },
  { value: 'unavailable', label: 'Немає' }
];
const sortOptions = [
  { value: 'updated_desc', label: 'Оновлені спочатку' },
  { value: 'name_asc', label: 'Назва А-Я' },
  { value: 'price_asc', label: 'Ціна зростає' },
  { value: 'price_desc', label: 'Ціна спадає' },
  { value: 'stock_desc', label: 'Більше залишків' },
  { value: 'stock_asc', label: 'Менше залишків' }
];

function summaryCards(summary?: CatalogSummary) {
  return [
    { label: 'Усього', value: summary?.total || 0, tone: '' },
    { label: 'Опубліковано', value: summary?.byStatus.published || 0, tone: 'success' },
    { label: 'Чернетки', value: summary?.byStatus.draft || 0, tone: 'warning' },
    { label: 'Немає в наявності', value: summary?.byAvailability.unavailable || 0, tone: 'danger' }
  ];
}

function importActionLabel(row: CatalogImportPreview['rows'][number]) {
  if (row.result === 'created') return 'Створено';
  if (row.result === 'updated') return 'Оновлено';
  if (row.action === 'create') return 'Новий';
  if (row.action === 'update') return 'Оновити';
  if (row.action === 'conflict') return 'Конфлікт';
  if (row.action === 'skipped') return 'Пропущено';
  return 'Помилка';
}

function CatalogMiniThumb({ imageUrl, className = 'catalog-thumb' }: { imageUrl: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  return <span className={className}>
    {imageUrl && !failed
      ? <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <Icon name="phone" size={20} />}
  </span>;
}

function ProductThumb({ product }: { product: CatalogProduct }) {
  return <CatalogMiniThumb imageUrl={product.mainImageUrl} />;
}

function compareCatalogLabel<T extends { label: string }>(left: T, right: T) {
  return left.label.localeCompare(right.label, 'uk-UA', { sensitivity: 'base' });
}

type CatalogEditorTab = 'main' | 'availability' | 'media' | 'description' | 'condition' | 'characteristics' | 'modifications' | 'seo' | 'internal';
type CatalogDeleteGroupAction = 'disband' | 'promote';
type CatalogDeleteChoice = {
  product: CatalogProduct;
  groupAction?: CatalogDeleteGroupAction;
  newMainProductId?: string | null;
};

const editorTabs: Array<{ id: CatalogEditorTab; label: string }> = [
  { id: 'main', label: 'Основне' },
  { id: 'availability', label: 'Ціна і наявність' },
  { id: 'media', label: 'Медіа' },
  { id: 'description', label: 'Опис' },
  { id: 'condition', label: 'Стан' },
  { id: 'characteristics', label: 'Характеристики' },
  { id: 'modifications', label: 'Модифікації' },
  { id: 'seo', label: 'SEO' },
  { id: 'internal', label: 'Внутрішнє' }
];
const newModificationGroupId = '__new__';

function diagnosticText(diagnostics: Record<string, unknown>, key: string) {
  const value = diagnostics[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(String).join('\n');
  return '';
}

function mediaAltFromFile(file: File) {
  return file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function catalogPreviewPath(product: Pick<CatalogProduct, 'slug' | 'publicPath'>) {
  if (!product.slug && product.publicPath) return product.publicPath;
  return `/catalog/preview/storefront/smartphones/${encodeURIComponent(product.slug)}`;
}

function isChildModification(product: CatalogProduct) {
  return Boolean(product.modificationGroup && !product.modificationGroup.isMain && product.modificationGroup.mainProductId);
}

function splitLooseDescriptionCss(source: string) {
  const firstTagIndex = source.search(/<[a-zA-Z!/]/);
  const prefix = firstTagIndex >= 0 ? source.slice(0, firstTagIndex) : source;
  const looksLikeCss = prefix.includes('{') && prefix.includes('}')
    && /(^|\s)(\.|#|@media\b|@supports\b|@keyframes\b|[a-z][a-z0-9_-]*[\s.#:[>+~,{])/i.test(prefix.trim());
  if (!looksLikeCss) return { html: source, css: '' };
  return {
    html: firstTagIndex >= 0 ? source.slice(firstTagIndex) : '',
    css: prefix
  };
}

function RichTextEditor({
  value,
  onChange,
  maxLength = 12000
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'visual' | 'source' | 'preview'>('visual');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    if (mode !== 'visual' || !editorRef.current) return;
    if (editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
  }, [mode, value]);

  function applyFormat(command: string, argument?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(editorRef.current?.innerHTML || '');
  }

  function addLink() {
    const url = window.prompt('URL');
    if (!url) return;
    applyFormat('createLink', url);
  }

  function previewSrcDoc() {
    const source = splitLooseDescriptionCss(value);
    const css = source.css.replace(/<\/style/gi, '<\\/style');
    const html = source.html.replace(/<\/script/gi, '<\\/script').replace(/<\/style/gi, '<\\/style');
    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;padding:18px;font:15px/1.6 Arial,sans-serif;color:#111827;background:#fff}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:8px}a{color:#0f766e}${css}</style></head><body>${html}</body></html>`;
  }

  return <div className="rich-editor">
    <div className="rich-editor__toolbar">
      <div className="segmented rich-editor__mode">
        <button className={mode === 'visual' ? 'active' : ''} type="button" onClick={() => setMode('visual')}>Візуально</button>
        <button className={mode === 'source' ? 'active' : ''} type="button" onClick={() => setMode('source')}>Джерело</button>
        <button className={mode === 'preview' ? 'active' : ''} type="button" onClick={() => setMode('preview')}>Preview</button>
      </div>
      <button className="icon-button" type="button" title="Заголовок H2" aria-label="Заголовок H2" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('formatBlock', 'h2')}>H2</button>
      <button className="icon-button" type="button" title="Заголовок H3" aria-label="Заголовок H3" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('formatBlock', 'h3')}>H3</button>
      <button className="icon-button" type="button" title="Абзац" aria-label="Абзац" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('formatBlock', 'p')}>P</button>
      <button className="icon-button" type="button" title="Bold" aria-label="Bold" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('bold')}><strong>B</strong></button>
      <button className="icon-button" type="button" title="Italic" aria-label="Italic" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('italic')}><em>I</em></button>
      <button className="icon-button" type="button" title="Underline" aria-label="Underline" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('underline')}><u>U</u></button>
      <button className="icon-button" type="button" title="Список" aria-label="Список" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('insertUnorderedList')}>•</button>
      <button className="icon-button" type="button" title="Нумерація" aria-label="Нумерація" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('insertOrderedList')}>1.</button>
      <button className="icon-button" type="button" title="Посилання" aria-label="Посилання" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={addLink}><Icon name="link" size={18} /></button>
      <button className="icon-button" type="button" title="Undo" aria-label="Undo" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('undo')}><Icon name="reply" size={18} /></button>
      <button className="icon-button" type="button" title="Redo" aria-label="Redo" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('redo')}><Icon name="arrowRight" size={18} /></button>
      <button className="icon-button" type="button" title="Очистити формат" aria-label="Очистити формат" disabled={mode !== 'visual'} onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat('removeFormat')}><Icon name="remove" size={18} /></button>
      {mode === 'preview' && <div className="segmented rich-editor__device">
        <button className={previewDevice === 'desktop' ? 'active' : ''} type="button" onClick={() => setPreviewDevice('desktop')}>Desktop</button>
        <button className={previewDevice === 'mobile' ? 'active' : ''} type="button" onClick={() => setPreviewDevice('mobile')}>Mobile</button>
      </div>}
    </div>
    {mode === 'visual'
      ? <div
        className="rich-editor__surface"
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
      : mode === 'source'
        ? <textarea className="rich-editor__source" value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
        : <div className={`rich-editor__preview rich-editor__preview--${previewDevice}`}>
          <iframe title="Preview опису" sandbox="allow-scripts" srcDoc={previewSrcDoc()} />
        </div>}
  </div>;
}

function characteristicStringValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function characteristicArrayValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function characteristicColorValue(value: unknown) {
  const fallbackHex = '#000000';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const color = value as { name?: unknown; hex?: unknown };
    const hex = characteristicStringValue(color.hex).trim();
    return {
      name: characteristicStringValue(color.name),
      hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallbackHex
    };
  }
  const text = characteristicStringValue(value).trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return { name: '', hex: text.toLowerCase() };
  return { name: text, hex: fallbackHex };
}

function stableSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSnapshotValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((snapshot, key) => {
        snapshot[key] = stableSnapshotValue((value as Record<string, unknown>)[key]);
        return snapshot;
      }, {});
  }
  return value;
}

function stableSnapshot(value: unknown) {
  return JSON.stringify(stableSnapshotValue(value));
}

function CharacteristicFieldControl({
  field,
  value,
  onChange
}: {
  field: CatalogCharacteristicField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const unit = field.unit ? <small>{field.unit}</small> : null;
  if (field.type === 'boolean') {
    return <label className="catalog-characteristic-toggle">
      <input type="checkbox" checked={value === true || value === 'true'} onChange={(event) => onChange(event.target.checked)} />
      <span>{field.label}{field.required ? ' *' : ''}</span>
    </label>;
  }
  if (field.type === 'select') {
    return <label className="field catalog-characteristic-field">
      <span>{field.label}{field.required ? ' *' : ''}</span>
      <StyledSelect
        value={characteristicStringValue(value)}
        options={[{ value: '', label: 'Не обрано' }, ...field.options.map((option) => ({ value: option, label: option }))]}
        onChange={onChange}
      />
      {unit}
    </label>;
  }
  if (field.type === 'multiselect') {
    const selected = new Set(characteristicArrayValue(value));
    return <div className="catalog-characteristic-field catalog-characteristic-field--multi">
      <span>{field.label}{field.required ? ' *' : ''}</span>
      <div className="catalog-characteristic-options">
        {field.options.map((option) => <label key={option}>
          <input
            type="checkbox"
            checked={selected.has(option)}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) next.add(option);
              else next.delete(option);
              onChange(Array.from(next));
            }}
          />
          <span>{option}</span>
        </label>)}
        {!field.options.length && <small>Додайте опції у шаблоні характеристик.</small>}
      </div>
      {unit}
    </div>;
  }
  if (field.type === 'color') {
    const colorValue = characteristicColorValue(value);
    return <label className="field catalog-characteristic-field">
      <span>{field.label}{field.required ? ' *' : ''}</span>
      <div className="catalog-color-input">
        <input type="color" value={colorValue.hex} onChange={(event) => onChange({ ...colorValue, hex: event.target.value.toLowerCase() })} />
        <input value={colorValue.name} placeholder="Назва кольору" onChange={(event) => onChange({ ...colorValue, name: event.target.value })} maxLength={120} />
      </div>
    </label>;
  }
  const input = <input
    type={field.type === 'number' ? 'number' : 'text'}
    value={characteristicStringValue(value)}
    onChange={(event) => onChange(event.target.value)}
  />;
  return <label className="field catalog-characteristic-field">
    <span>{field.label}{field.required ? ' *' : ''}</span>
    {field.unit ? <div className="catalog-unit-input">{input}<em>{field.unit}</em></div> : input}
  </label>;
}

function ProductEditorScreen({
  product,
  brands,
  brandDirectories,
  busy,
  onClose,
  onSubmit,
  onProductUpdated,
  onSwitchProduct
}: {
  product: CatalogProduct | null;
  brands: CatalogBrand[];
  brandDirectories: CatalogBrandDirectory[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CatalogProductInput, product: CatalogProduct | null) => Promise<CatalogProduct | null>;
  onProductUpdated: (product: CatalogProduct) => Promise<void> | void;
  onSwitchProduct: (productId: string) => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<CatalogProductInput>(() => (
    product ? productToInput(product) : { ...emptyCatalogProductInput }
  ));
  const [activeTab, setActiveTab] = useState<CatalogEditorTab>('main');
  const [mediaBusy, setMediaBusy] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
  const [galleryDropTarget, setGalleryDropTarget] = useState<{ index: number; placement: 'before' | 'after' } | null>(null);
  const [linkedSaveBusy, setLinkedSaveBusy] = useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedCharacteristicTemplateId, setSelectedCharacteristicTemplateId] = useState('');
  const [characteristicValues, setCharacteristicValues] = useState<Record<string, unknown>>({});
  const [selectedBrandDirectoryId, setSelectedBrandDirectoryId] = useState(product?.brand?.directoryId || '');
  const [selectedModificationGroupId, setSelectedModificationGroupId] = useState('');
  const [modificationGroupLabel, setModificationGroupLabel] = useState('');
  const [selectedModificationProductIds, setSelectedModificationProductIds] = useState<string[]>([]);
  const [mainModificationProductId, setMainModificationProductId] = useState('');
  const [characteristicsLoaded, setCharacteristicsLoaded] = useState(!product?.id);
  const [modificationsLoaded, setModificationsLoaded] = useState(!product?.id);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [leavePrompt, setLeavePrompt] = useState<null | { type: 'navigation' | 'action' | 'browser'; action?: () => void | Promise<void> }>(null);
  const currentSnapshotRef = useRef('');
  const currentLocationRef = useRef('');
  const allowNextNavigationRef = useRef(false);
  const browserUnloadArmedRef = useRef(false);

  const characteristicTemplates = useQuery<CatalogCharacteristicTemplate[]>({
    queryKey: ['catalog-characteristic-templates'],
    queryFn: api.catalog.characteristicTemplates
  });
  const productGroups = useQuery<CatalogProductGroup[]>({
    queryKey: ['catalog-product-groups'],
    queryFn: api.catalog.productGroups
  });
  const modificationCandidates = useQuery<CatalogFeed>({
    queryKey: ['catalog-modification-candidates'],
    queryFn: () => api.catalog.list({ page: 1, pageSize: 100, sort: 'name_asc', status: 'all', condition: 'all', availability: 'all' }),
    enabled: Boolean(product?.id)
  });
  const productCharacteristics = useQuery({
    queryKey: ['catalog-product-characteristics', product?.id],
    queryFn: () => api.catalog.productCharacteristics(product!.id),
    enabled: Boolean(product?.id),
    retry: false
  });
  const productModifications = useQuery({
    queryKey: ['catalog-product-modifications', product?.id],
    queryFn: () => api.catalog.productModifications(product!.id),
    enabled: Boolean(product?.id),
    retry: false
  });
  const selectedCharacteristicTemplate = useMemo(
    () => (characteristicTemplates.data || []).find((template) => template.id === selectedCharacteristicTemplateId) || null,
    [characteristicTemplates.data, selectedCharacteristicTemplateId]
  );
  const selectedModificationGroup = useMemo(
    () => (productGroups.data || []).find((group) => group.id === selectedModificationGroupId) || null,
    [productGroups.data, selectedModificationGroupId]
  );
  const editorBusy = busy || linkedSaveBusy;
  const groupSwitchItems = productModifications.data?.items || [];
  const sortedBrandDirectories = useMemo(
    () => [...brandDirectories]
      .filter((directory) => directory.active || directory.id === product?.brand?.directoryId)
      .sort(compareCatalogLabel),
    [brandDirectories, product?.brand?.directoryId]
  );
  const sortedBrands = useMemo(
    () => [...brands]
      .filter((brand) => brand.directoryId === selectedBrandDirectoryId && (brand.active || brand.id === draft.brandId))
      .sort(compareCatalogLabel),
    [brands, draft.brandId, selectedBrandDirectoryId]
  );
  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === draft.brandId) || null,
    [brands, draft.brandId]
  );
  const editorSnapshot = useMemo(() => stableSnapshot({
    draft,
    selectedCharacteristicTemplateId,
    characteristicValues,
    selectedModificationGroupId,
    modificationGroupLabel,
    selectedModificationProductIds,
    mainModificationProductId
  }), [
    characteristicValues,
    draft,
    mainModificationProductId,
    modificationGroupLabel,
    selectedCharacteristicTemplateId,
    selectedModificationGroupId,
    selectedModificationProductIds
  ]);
  const hasUnsavedChanges = Boolean(savedSnapshot && editorSnapshot !== savedSnapshot);

  useEffect(() => {
    currentSnapshotRef.current = editorSnapshot;
  }, [editorSnapshot]);

  useEffect(() => {
    if (!hasUnsavedChanges) currentLocationRef.current = `${location.pathname}${location.search}${location.hash}`;
  }, [hasUnsavedChanges, location.hash, location.pathname, location.search]);

  useEffect(() => {
    setDraft(product ? productToInput(product) : { ...emptyCatalogProductInput });
    setSelectedBrandDirectoryId(product?.brand?.directoryId || '');
    setSelectedCharacteristicTemplateId('');
    setCharacteristicValues({});
    setSelectedModificationGroupId(newModificationGroupId);
    setModificationGroupLabel(product?.name || '');
    setSelectedModificationProductIds(product?.id ? [product.id] : []);
    setMainModificationProductId(product?.id || '');
    setCharacteristicsLoaded(!product?.id);
    setModificationsLoaded(!product?.id);
    setSavedSnapshot('');
    setLeavePrompt(null);
    browserUnloadArmedRef.current = false;
    allowNextNavigationRef.current = false;
  }, [product?.brand?.directoryId, product?.id]);

  useEffect(() => {
    if (selectedBrand && selectedBrand.directoryId !== selectedBrandDirectoryId) {
      setSelectedBrandDirectoryId(selectedBrand.directoryId);
    }
  }, [selectedBrand, selectedBrandDirectoryId]);

  useEffect(() => {
    if (selectedBrandDirectoryId || !sortedBrandDirectories.length) return;
    setSelectedBrandDirectoryId(sortedBrandDirectories[0].id);
  }, [selectedBrandDirectoryId, sortedBrandDirectories]);

  useEffect(() => {
    if (!productCharacteristics.data) return;
    setSelectedCharacteristicTemplateId(productCharacteristics.data.templateId || '');
    setCharacteristicValues(productCharacteristics.data.values || {});
    setCharacteristicsLoaded(true);
  }, [productCharacteristics.data]);

  useEffect(() => {
    if (!productModifications.data) return;
    setSelectedModificationGroupId(productModifications.data.groupId || newModificationGroupId);
    setModificationGroupLabel(productModifications.data.groupLabel || product?.name || '');
    setSelectedModificationProductIds(productModifications.data.items.length
      ? productModifications.data.items.map((item) => item.id)
      : product?.id ? [product.id] : []);
    setMainModificationProductId(productModifications.data.mainProductId || product?.id || '');
    setModificationsLoaded(true);
  }, [product?.id, product?.name, productModifications.data]);

  useEffect(() => {
    if (!product?.id || productCharacteristics.isLoading || productCharacteristics.data) return;
    if (productCharacteristics.isError) setCharacteristicsLoaded(true);
  }, [product?.id, productCharacteristics.data, productCharacteristics.isError, productCharacteristics.isLoading]);

  useEffect(() => {
    if (!product?.id || productModifications.isLoading || productModifications.data) return;
    if (productModifications.isError) setModificationsLoaded(true);
  }, [product?.id, productModifications.data, productModifications.isError, productModifications.isLoading]);

  useEffect(() => {
    if (!product || selectedCharacteristicTemplateId || productCharacteristics.isLoading) return;
    const firstTemplate = characteristicTemplates.data?.find((template) => template.active) || characteristicTemplates.data?.[0];
    if (firstTemplate) setSelectedCharacteristicTemplateId(firstTemplate.id);
  }, [characteristicTemplates.data, product, productCharacteristics.isLoading, selectedCharacteristicTemplateId]);

  useEffect(() => {
    if (savedSnapshot || !characteristicsLoaded || !modificationsLoaded) return undefined;
    const timer = window.setTimeout(() => setSavedSnapshot(currentSnapshotRef.current), 0);
    return () => window.clearTimeout(timer);
  }, [characteristicsLoaded, modificationsLoaded, product?.id, savedSnapshot]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!target || target.target && target.target !== '_self' || target.hasAttribute('download')) return;
      const nextUrl = new URL(target.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;
      if (allowNextNavigationRef.current || leavePrompt) {
        allowNextNavigationRef.current = false;
        return;
      }
      event.preventDefault();
      allowNextNavigationRef.current = true;
      setLeavePrompt({ type: 'action', action: () => navigate(nextPath) });
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [hasUnsavedChanges, leavePrompt, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handlePopState = (event: PopStateEvent) => {
      if (allowNextNavigationRef.current) {
        allowNextNavigationRef.current = false;
        return;
      }
      const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const currentPath = currentLocationRef.current || `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, '', currentPath);
      allowNextNavigationRef.current = true;
      setLeavePrompt((current) => current || { type: 'action', action: () => navigate(nextPath) });
    };
    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [hasUnsavedChanges, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (browserUnloadArmedRef.current) return;
      browserUnloadArmedRef.current = true;
      setLeavePrompt((current) => current || { type: 'browser' });
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const publishBlockers = useMemo(() => {
    const blockers = [];
    if (!draft.name.trim()) blockers.push('Назва');
    if (!draft.condition) blockers.push('Стан');
    if (Number(draft.priceUah || 0) <= 0) blockers.push('Ціна більше 0');
    if (!draft.mainImageUrl.trim()) blockers.push('Головне фото');
    if (!draft.slug.trim()) blockers.push('Slug');
    return blockers;
  }, [draft.condition, draft.mainImageUrl, draft.name, draft.priceUah, draft.slug]);

  const recommendations = useMemo(() => {
    const items = [];
    if (!draft.shortDescription.trim()) items.push('Короткий опис');
    if (!draft.description.trim()) items.push('Повний опис');
    if (!draft.bodyCondition.trim() || !draft.displayCondition.trim() || !draft.batteryHealth.trim()) items.push('Деталі стану');
    if (!draft.seoDescription.trim()) items.push('SEO description');
    return items;
  }, [draft.batteryHealth, draft.bodyCondition, draft.description, draft.displayCondition, draft.seoDescription, draft.shortDescription]);

  const availabilityLabel = draft.stockCount > 0 ? 'В наявності' : draft.incomingCount > 0 ? 'В дорозі' : 'Немає в наявності';
  const importIdentityChanged = Boolean(product && (
    draft.name.trim() !== product.name || draft.condition !== product.condition
  ));

  function setField<K extends keyof CatalogProductInput>(key: K, value: CatalogProductInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseBrandDirectory(directoryId: string) {
    setSelectedBrandDirectoryId(directoryId);
    setField('brandId', null);
  }

  function setDiagnostic(key: string, value: string) {
    setDraft((current) => ({ ...current, diagnostics: { ...current.diagnostics, [key]: value } }));
  }

  function chooseCharacteristicTemplate(templateId: string) {
    setSelectedCharacteristicTemplateId(templateId);
    setCharacteristicValues({});
  }

  function setCharacteristicValue(key: string, value: unknown) {
    setCharacteristicValues((current) => ({ ...current, [key]: value }));
  }

  async function runAllowedAction(action?: () => void | Promise<void>) {
    if (!action) return;
    allowNextNavigationRef.current = true;
    await action();
  }

  function requestGuardedAction(action: () => void | Promise<void>) {
    if (!hasUnsavedChanges) {
      void runAllowedAction(action);
      return;
    }
    if (leavePrompt) {
      setLeavePrompt(null);
      void runAllowedAction(action);
      return;
    }
    setLeavePrompt({ type: 'action', action });
  }

  async function discardUnsavedChanges() {
    const prompt = leavePrompt;
    setLeavePrompt(null);
    browserUnloadArmedRef.current = true;
    if (prompt?.action) await runAllowedAction(prompt.action);
  }

  async function saveBeforeLeaving() {
    const prompt = leavePrompt;
    const saved = await submitAll();
    if (!saved) return;
    setLeavePrompt(null);
    browserUnloadArmedRef.current = false;
    if (prompt?.action) await runAllowedAction(prompt.action);
  }

  function chooseModificationGroup(groupId: string) {
    setSelectedModificationGroupId(groupId);
    setSelectedModificationProductIds(product?.id ? [product.id] : []);
    setMainModificationProductId(product?.id || '');
    if (groupId === newModificationGroupId) {
      setModificationGroupLabel(product?.name || '');
      return;
    }
    const group = (productGroups.data || []).find((item) => item.id === groupId);
    setModificationGroupLabel(group?.label || '');
    setMainModificationProductId(group?.mainProductId || product?.id || '');
  }

  function toggleModificationProduct(productId: string, enabled: boolean) {
    setSelectedModificationProductIds((current) => (
      enabled
        ? [...current, productId].filter((id, index, list) => list.indexOf(id) === index)
        : current.filter((id) => id !== productId)
    ));
    if (!enabled && mainModificationProductId === productId) setMainModificationProductId(product?.id || '');
  }

  async function saveLinkedProductData(savedProduct: CatalogProduct) {
    let current = savedProduct;
    const invalidationKeys: Array<readonly unknown[]> = [];

    if (selectedCharacteristicTemplateId) {
      current = await api.catalog.updateProductCharacteristics(current.id, {
        templateId: selectedCharacteristicTemplateId,
        values: characteristicValues,
        expectedVersion: current.version
      });
      invalidationKeys.push(
        ['catalog-product-characteristics', current.id],
        ['catalog-products'],
        ['catalog-summary']
      );
    }

    const productIds = [...new Set([current.id, ...selectedModificationProductIds])];
    if (productIds.length >= 2) {
      const groupId = selectedModificationGroupId && selectedModificationGroupId !== newModificationGroupId
        ? selectedModificationGroupId
        : null;
      if (!groupId && !modificationGroupLabel.trim()) throw new Error('Вкажіть назву групи модифікацій.');
      current = await api.catalog.updateProductModifications(current.id, {
        groupId,
        groupLabel: modificationGroupLabel,
        mainProductId: mainModificationProductId || current.id,
        productIds,
        expectedVersion: current.version
      });
      invalidationKeys.push(
        ['catalog-product-modifications', current.id],
        ['catalog-product-groups'],
        ['catalog-products'],
        ['catalog-summary']
      );
    }

    if (invalidationKeys.length) {
      await Promise.all(invalidationKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      await onProductUpdated(current);
    }
    return current;
  }

  function setGalleryItem(index: number, key: 'url' | 'alt', value: string) {
    setDraft((current) => ({
      ...current,
      gallery: current.gallery.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item))
    }));
  }

  function removeGalleryItem(index: number) {
    setDraft((current) => {
      const removed = current.gallery[index];
      const gallery = current.gallery.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        gallery,
        mainImageUrl: removed?.url && current.mainImageUrl === removed.url ? gallery[0]?.url || '' : current.mainImageUrl
      };
    });
  }

  function reorderGalleryItem(fromIndex: number, toIndex: number) {
    setDraft((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.gallery.length || toIndex >= current.gallery.length) return current;
      const gallery = [...current.gallery];
      const [item] = gallery.splice(fromIndex, 1);
      gallery.splice(toIndex, 0, item);
      return { ...current, gallery };
    });
  }

  function startGalleryDrag(event: DragEvent<HTMLElement>, index: number) {
    setDraggedGalleryIndex(index);
    setGalleryDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function overGalleryItem(event: DragEvent<HTMLElement>, index: number) {
    if (draggedGalleryIndex === null || draggedGalleryIndex === index) return;
    event.preventDefault();
    setGalleryDropTarget({ index, placement: draggedGalleryIndex < index ? 'after' : 'before' });
  }

  function dropGalleryItem(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData('text/plain');
    const fromIndex = draggedGalleryIndex ?? Number(rawIndex);
    const targetIndex = galleryDropTarget?.index === index && galleryDropTarget.placement === 'after' && fromIndex > index
      ? index + 1
      : galleryDropTarget?.index === index && galleryDropTarget.placement === 'before' && fromIndex < index
        ? index - 1
        : index;
    if (Number.isInteger(fromIndex)) reorderGalleryItem(fromIndex, targetIndex);
    setDraggedGalleryIndex(null);
    setGalleryDropTarget(null);
  }

  async function uploadProductPhotos(files: FileList | null) {
    const allFiles = Array.from(files || []);
    const remainingSlots = Math.max(0, 20 - draft.gallery.length);
    const selected = allFiles.slice(0, remainingSlots);
    if (!selected.length) return;
    try {
      setMediaError('');
      setMediaBusy('gallery-batch');
      selected.forEach(validateCatalogImageFile);
      const uploaded: Array<{ url: string; alt: string }> = [];
      for (const file of selected) {
        const webp = await convertCatalogImageToWebp(file);
        const media = await api.catalog.uploadMedia(webp, file.name.replace(/\.[^.]+$/, '.webp'), file);
        uploaded.push({ url: media.url, alt: mediaAltFromFile(file) });
      }
      setDraft((current) => ({
        ...current,
        mainImageUrl: current.mainImageUrl || uploaded[0]?.url || '',
        gallery: [...current.gallery, ...uploaded].slice(0, 20)
      }));
      if (allFiles.length > selected.length) {
        setMediaError(`Додано ${selected.length} фото з ${allFiles.length}. Максимум у галереї: 20 фото.`);
      }
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Не вдалося завантажити фото.');
    } finally {
      setMediaBusy('');
    }
  }

  async function submitAll() {
    setLinkedSaveBusy(true);
    try {
      const savedProduct = await onSubmit(draft, product);
      if (!savedProduct) return null;
      const saved = await saveLinkedProductData(savedProduct);
      setSavedSnapshot(currentSnapshotRef.current);
      browserUnloadArmedRef.current = false;
      return saved;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти всі дані товару.', 'error');
      return null;
    } finally {
      setLinkedSaveBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await submitAll();
  }

  async function submitAndPreview() {
    const saved = await submitAll();
    if (saved?.publicPath) window.open(catalogPreviewPath(saved), '_blank', 'noopener,noreferrer');
  }

  const editorTitle = draft.name.trim() || product?.name || 'Новий смартфон';
  const editorCode = product ? product.productCode : 'Новий товар';

  return <form className="catalog-editor-screen" onSubmit={(event) => void submit(event)}>
    <header className="catalog-editor-screen__topbar">
      <button className="button button--secondary" type="button" onClick={() => requestGuardedAction(onClose)}><Icon name="arrowLeft" size={17} /> До списку</button>
      <div className="catalog-editor-heading">
        <p className="eyebrow">{editorCode}</p>
        <h1 className="catalog-editor-title" data-full-title={editorTitle}><span>{editorTitle}</span></h1>
      </div>
      <div className="catalog-editor-controls">
        {hasUnsavedChanges && <span className="catalog-unsaved-badge"><Icon name="schedule" size={15} /> Незбережені зміни</span>}
        <label className="catalog-editor-status">
          <span>Статус</span>
          <StyledSelect value={draft.publicationStatus} options={catalogPublicationStatusOptions} onChange={(value) => setField('publicationStatus', value as CatalogPublicationStatus)} ariaLabel="Статус публікації" compact />
        </label>
        <div className="catalog-editor-actions">
          {product?.publicPath && <a className="button button--secondary" href={catalogPreviewPath(product)} target="_blank" rel="noreferrer"><Icon name="openInNew" size={17} /> Перегляд</a>}
          <button className="button button--secondary" type="button" disabled={editorBusy} onClick={() => void submitAndPreview()}><Icon name="visibility" size={17} /> Зберегти і переглянути</button>
          <button className="button button--primary" type="submit" disabled={editorBusy}><Icon name="save" size={17} /> Зберегти</button>
        </div>
      </div>
    </header>

    {groupSwitchItems.length > 1 && <nav className="catalog-editor-group-switcher" aria-label="Товари групи модифікацій">
      <div>
        <span>Група модифікацій</span>
        <strong>{productModifications.data?.groupLabel || product?.modificationGroup?.groupLabel || 'Модифікації товару'}</strong>
      </div>
      <div className="catalog-editor-group-switcher__items">
        {groupSwitchItems.map((item) => {
          const active = item.id === product?.id;
          const isMain = item.id === productModifications.data?.mainProductId;
          return <button
            className={`catalog-editor-group-switcher__item${active ? ' active' : ''}`}
            type="button"
            disabled={active}
            key={item.id}
            onClick={() => requestGuardedAction(() => onSwitchProduct(item.id))}
          >
            <CatalogMiniThumb imageUrl={item.mainImageUrl} className="catalog-editor-group-switcher__thumb" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.productCode} · {item.priceLabel}{isMain ? ' · Основний' : ''}</small>
            </span>
          </button>;
        })}
      </div>
    </nav>}

    <div className="catalog-editor-screen__layout">
      <aside className="catalog-editor-tabs" aria-label="Розділи редактора">
        {editorTabs.map((tab) => <button className={activeTab === tab.id ? 'active' : ''} type="button" key={tab.id} onClick={() => setActiveTab(tab.id)}>
          {tab.label}
        </button>)}
        <div className={`catalog-readiness${publishBlockers.length ? ' catalog-readiness--warning' : ' catalog-readiness--ready'}`}>
          <span>{publishBlockers.length ? 'Не готово до публікації' : 'Готово до публікації'}</span>
          {publishBlockers.length > 0 && <ul>{publishBlockers.map((item) => <li key={item}>{item}</li>)}</ul>}
          {!publishBlockers.length && recommendations.length > 0 && <ul>{recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      </aside>

      <section className="catalog-editor-panel">
        {importIdentityChanged && <p className="form-message form-message--error">Назва і стан є ключем імпорту. Їх зміна може створити окрему позицію під час наступного XLSX-імпорту.</p>}

        {activeTab === 'main' && <section className="catalog-editor-section">
          <header><h2>Основна інформація</h2><span>{product ? product.productCode : 'Код буде створено після збереження'}</span></header>
          <div className="catalog-editor-grid">
            <label className="field catalog-editor-grid__wide"><span>Назва</span><input value={draft.name} onChange={(event) => setField('name', event.target.value)} required maxLength={240} /></label>
            <label className="field"><span>Стан</span><StyledSelect value={draft.condition} options={catalogConditionOptions} onChange={(value) => setField('condition', value as CatalogCondition)} /></label>
            <label className="field"><span>Довідник брендів</span><StyledSelect value={selectedBrandDirectoryId} options={sortedBrandDirectories.length ? sortedBrandDirectories.map((directory) => ({ value: directory.id, label: directory.label, disabled: !directory.active })) : [{ value: '', label: 'Довідників немає', disabled: true }]} onChange={(value) => chooseBrandDirectory(String(value))} disabled={!sortedBrandDirectories.length} /></label>
            <label className="field"><span>Бренд</span><StyledSelect value={draft.brandId || ''} options={[{ value: '', label: 'Без бренду' }, ...sortedBrands.map((brand) => ({ value: brand.id, label: brand.label, disabled: !brand.active }))]} onChange={(value) => setField('brandId', value ? String(value) : null)} disabled={!selectedBrandDirectoryId} searchable searchPlaceholder="Пошук бренду" /></label>
            <label className="field"><span>Slug</span><input value={draft.slug} onChange={(event) => setField('slug', event.target.value)} placeholder="iphone-13-used" maxLength={260} /></label>
          </div>
        </section>}

        {activeTab === 'availability' && <section className="catalog-editor-section">
          <header><h2>Ціна і наявність</h2><span>{availabilityLabel}</span></header>
          <div className="catalog-editor-grid">
            <label className="field"><span>Ціна, грн</span><input type="number" min={0} step="0.01" value={draft.priceUah} onChange={(event) => setField('priceUah', Number(event.target.value || 0))} /></label>
            <label className="field"><span>Залишок</span><input type="number" min={0} step={1} value={draft.stockCount} onChange={(event) => setField('stockCount', Number(event.target.value || 0))} /></label>
            <label className="field"><span>В дорозі</span><input type="number" min={0} step={1} value={draft.incomingCount} onChange={(event) => setField('incomingCount', Number(event.target.value || 0))} /></label>
          </div>
        </section>}

        {activeTab === 'media' && <section className="catalog-editor-section">
          <header>
            <h2>Медіа</h2>
            <div className="catalog-editor-header-actions">
              <label className="button button--secondary button--small">
                <Icon name="upload" size={15} /> {mediaBusy === 'gallery-batch' ? 'Завантаження...' : 'Завантажити фото'}
                <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple disabled={Boolean(mediaBusy) || draft.gallery.length >= 20} onChange={(event) => { void uploadProductPhotos(event.target.files); event.currentTarget.value = ''; }} />
              </label>
            </div>
          </header>
          {mediaError && <p className="form-message form-message--error">{mediaError}</p>}
          <div className="catalog-gallery-editor">
            <div className="catalog-gallery-grid">
              {draft.gallery.map((item, index) => {
                const isMain = Boolean(item.url && draft.mainImageUrl === item.url);
                return <article
                  className={`catalog-gallery-tile${isMain ? ' catalog-gallery-tile--main' : ''}${draggedGalleryIndex === index ? ' catalog-gallery-tile--dragging' : ''}${galleryDropTarget?.index === index ? ` catalog-gallery-tile--drop-${galleryDropTarget.placement}` : ''}`}
                  key={index}
                  onDragOver={(event) => overGalleryItem(event, index)}
                  onDrop={(event) => dropGalleryItem(event, index)}
                  onDragEnd={() => { setDraggedGalleryIndex(null); setGalleryDropTarget(null); }}
                >
                  <span className="catalog-gallery-tile__image">{item.url ? <img src={item.url} alt="" /> : <Icon name="savedBanners" size={22} />}</span>
                  <label className="catalog-gallery-tile__main"><input type="checkbox" checked={isMain} disabled={!item.url} onChange={(event) => setField('mainImageUrl', event.target.checked ? item.url : '')} /> Головне фото</label>
                  <label className="field"><span>Alt</span><input value={item.alt} onChange={(event) => setGalleryItem(index, 'alt', event.target.value)} maxLength={240} /></label>
                  <div className="catalog-gallery-row__actions">
                    <span className="catalog-drag-handle catalog-drag-handle--icon" draggable={draft.gallery.length > 1} aria-disabled={draft.gallery.length <= 1} title="Перетягнути фото" onDragStart={(event) => startGalleryDrag(event, index)}><Icon name="menu" size={18} /></span>
                    <button className="icon-button icon-button--danger" type="button" onClick={() => removeGalleryItem(index)} aria-label="Видалити фото"><Icon name="delete" /></button>
                  </div>
                </article>;
              })}
            </div>
            {!draft.gallery.length && <p className="catalog-editor-muted">Доданих фото ще немає.</p>}
          </div>
        </section>}

        {activeTab === 'description' && <section className="catalog-editor-section">
          <header><h2>Опис</h2></header>
          <div className="catalog-editor-grid">
            <label className="field catalog-editor-grid__wide"><span>Короткий опис</span><textarea value={draft.shortDescription} onChange={(event) => setField('shortDescription', event.target.value)} maxLength={1200} /></label>
            <label className="field catalog-editor-grid__wide"><span>Повний опис</span><RichTextEditor value={draft.description} onChange={(value) => setField('description', value)} maxLength={12000} /></label>
          </div>
        </section>}

        {activeTab === 'condition' && <section className="catalog-editor-section">
          <header><h2>Стан пристрою</h2></header>
          <div className="catalog-editor-grid">
            <label className="field"><span>Корпус</span><input value={draft.bodyCondition} onChange={(event) => setField('bodyCondition', event.target.value)} maxLength={120} /></label>
            <label className="field"><span>Дисплей</span><input value={draft.displayCondition} onChange={(event) => setField('displayCondition', event.target.value)} maxLength={120} /></label>
            <label className="field"><span>Акумулятор</span><input value={draft.batteryHealth} onChange={(event) => setField('batteryHealth', event.target.value)} maxLength={120} /></label>
            <label className="field"><span>Гарантія</span><input value={draft.warranty} onChange={(event) => setField('warranty', event.target.value)} maxLength={160} /></label>
            <label className="field catalog-editor-grid__wide"><span>Комплектація</span><textarea value={draft.includedAccessories} onChange={(event) => setField('includedAccessories', event.target.value)} maxLength={3000} /></label>
            <label className="field catalog-editor-grid__wide"><span>Дефекти</span><textarea value={diagnosticText(draft.diagnostics, 'defectsText')} onChange={(event) => setDiagnostic('defectsText', event.target.value)} maxLength={3000} /></label>
          </div>
        </section>}

        {activeTab === 'characteristics' && <section className="catalog-editor-section">
          <header>
            <h2>Характеристики</h2>
          </header>
          {!product && <div className="catalog-editor-notice">Спершу збережіть товар. Після створення картки можна буде прив'язати її до шаблону характеристик.</div>}
          {product && <div className="catalog-editor-grid">
            <label className="field catalog-editor-grid__wide">
              <span>Шаблон характеристик</span>
              <StyledSelect
                value={selectedCharacteristicTemplateId}
                disabled={characteristicTemplates.isLoading}
                options={[
                  { value: '', label: characteristicTemplates.isLoading ? 'Завантаження шаблонів...' : 'Оберіть шаблон' },
                  ...(characteristicTemplates.data || []).map((template) => ({
                    value: template.id,
                    label: `${template.label}${template.active ? '' : ' (вимкнений)'}`
                  }))
                ]}
                onChange={(value) => chooseCharacteristicTemplate(String(value))}
              />
            </label>
            {!characteristicTemplates.isLoading && !characteristicTemplates.data?.length && <div className="catalog-editor-notice catalog-editor-grid__wide">
              Шаблонів ще немає. Створіть перший шаблон у розділі “Характеристики” сайдбару каталогу.
            </div>}
            {selectedCharacteristicTemplate && <div className="catalog-characteristics-form catalog-editor-grid__wide">
              <div className="catalog-characteristics-form__heading">
                <strong>{selectedCharacteristicTemplate.label}</strong>
                <span>{selectedCharacteristicTemplate.fields.length} полів</span>
              </div>
              {selectedCharacteristicTemplate.description && <p>{selectedCharacteristicTemplate.description}</p>}
              <div className="catalog-editor-grid">
                {selectedCharacteristicTemplate.fields.map((field) => <CharacteristicFieldControl
                  key={field.id || field.key}
                  field={field}
                  value={characteristicValues[field.key]}
                  onChange={(value) => setCharacteristicValue(field.key, value)}
                />)}
              </div>
            </div>}
          </div>}
        </section>}

        {activeTab === 'modifications' && <section className="catalog-editor-section">
          <header>
            <h2>Модифікації</h2>
          </header>
          {!product && <div className="catalog-editor-notice">Спершу збережіть товар. Після створення картки можна буде прив'язати її до групи модифікацій.</div>}
          {product && <div className="catalog-editor-grid">
            <label className="field catalog-editor-grid__wide">
              <span>Група товарів</span>
              <StyledSelect
                value={selectedModificationGroupId}
                disabled={productGroups.isLoading}
                options={[
                  { value: '', label: productGroups.isLoading ? 'Завантаження груп...' : 'Без групи модифікацій' },
                  { value: newModificationGroupId, label: 'Нова група модифікацій' },
                  ...(productGroups.data || []).map((group) => ({
                    value: group.id,
                    label: `${group.label} · ${group.itemCount} товарів`
                  }))
                ]}
                onChange={(value) => chooseModificationGroup(String(value))}
              />
            </label>
            {(selectedModificationGroupId || modificationGroupLabel) && <label className="field">
              <span>Назва групи</span>
              <input value={modificationGroupLabel} onChange={(event) => setModificationGroupLabel(event.target.value)} maxLength={240} placeholder="iPhone 13 Midnight" />
            </label>}
            {selectedModificationGroup && <div className="catalog-editor-notice">
              У групі зараз {selectedModificationGroup.itemCount} товарів. Зміна параметрів групи вплине на перемикачі всіх товарів цієї групи.
            </div>}
            <div className="catalog-modification-picker catalog-editor-grid__wide">
              <div className="catalog-characteristics-form__heading">
                <strong>Параметри перемикачів</strong>
                <span>{selectedModificationProductIds.length} вибрано</span>
              </div>
              {!modificationCandidates.isLoading && !modificationCandidates.data?.items.length && <div className="catalog-editor-notice">
                Параметрів модифікацій ще немає. Створіть їх у розділі "Модифікації" сайдбару каталогу.
              </div>}
              <div className="catalog-modification-options">
                {(modificationCandidates.data?.items || []).map((candidate) => <label className="catalog-modification-checkbox" key={candidate.id}>
                  <input
                    type="checkbox"
                    checked={selectedModificationProductIds.includes(candidate.id)}
                    disabled={candidate.id === product.id}
                    onChange={(event) => toggleModificationProduct(candidate.id, event.target.checked)}
                  />
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>{candidate.productCode} · {candidate.priceLabel} · {candidate.availability.label}</small>
                  </span>
                  <input
                    type="radio"
                    name="mainModificationProduct"
                    checked={mainModificationProductId === candidate.id}
                    disabled={!selectedModificationProductIds.includes(candidate.id)}
                    onChange={() => setMainModificationProductId(candidate.id)}
                  />
                </label>)}
              </div>
            </div>
          </div>}
        </section>}

        {activeTab === 'seo' && <section className="catalog-editor-section">
          <header><h2>SEO і соцмережі</h2></header>
          <div className="catalog-editor-grid">
            <label className="field"><span>SEO title</span><input value={draft.seoTitle} onChange={(event) => setField('seoTitle', event.target.value)} maxLength={240} /></label>
            <label className="field"><span>SEO description</span><input value={draft.seoDescription} onChange={(event) => setField('seoDescription', event.target.value)} maxLength={500} /></label>
            <label className="field catalog-editor-grid__wide"><span>Social description</span><textarea value={draft.socialDescription} onChange={(event) => setField('socialDescription', event.target.value)} maxLength={500} /></label>
          </div>
        </section>}

        {activeTab === 'internal' && <section className="catalog-editor-section">
          <header><h2>Внутрішнє</h2></header>
          <div className="catalog-editor-grid">
            <label className="field"><span>Серійний номер / IMEI</span><input value={diagnosticText(draft.diagnostics, 'privateSerial')} onChange={(event) => setDiagnostic('privateSerial', event.target.value)} maxLength={240} /></label>
            <label className="field catalog-editor-grid__wide"><span>Внутрішні нотатки</span><textarea value={draft.internalNotes} onChange={(event) => setField('internalNotes', event.target.value)} maxLength={6000} /></label>
          </div>
        </section>}
      </section>
    </div>
    {leavePrompt && <div className="modal-backdrop modal-backdrop--nested" role="presentation">
      <section className="modal catalog-unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-unsaved-title">
        <header className="modal__header">
          <div>
            <p className="eyebrow">Незбережені зміни</p>
            <h2 id="catalog-unsaved-title">Зміни в картці товару ще не збережені</h2>
          </div>
        </header>
        <div className="catalog-unsaved-modal__content">
          <span className="catalog-unsaved-modal__mark"><Icon name="schedule" size={24} /></span>
          <div>
            <p>Якщо вийти з редактора зараз, внесені зміни зітруться. Можна закрити редактор без збереження або спочатку зберегти зміни.</p>
            {leavePrompt.type === 'browser' && <small>Для закриття вкладки браузер може показати власне системне підтвердження. Повторна спроба не буде зупинена.</small>}
          </div>
        </div>
        <footer className="modal__footer catalog-unsaved-modal__footer">
          <button className="button button--secondary" type="button" onClick={() => void discardUnsavedChanges()}>Закрити</button>
          <button className="button button--primary" type="button" disabled={editorBusy} onClick={() => void saveBeforeLeaving()}><Icon name="save" size={17} /> Зберегти зміни</button>
        </footer>
      </section>
    </div>}
  </form>;
}

function CatalogRow({
  product,
  busy,
  selected,
  childrenCount = 0,
  expanded = false,
  onSelect,
  onOpen,
  onQuickSave,
  onShare,
  onDelete,
  onModifications,
  onToggleChildren
}: {
  product: CatalogProduct;
  busy: boolean;
  selected: boolean;
  childrenCount?: number;
  expanded?: boolean;
  onSelect: (product: CatalogProduct, selected: boolean) => void;
  onOpen: (product: CatalogProduct) => void;
  onQuickSave: (product: CatalogProduct, input: CatalogProductInput) => Promise<void>;
  onShare: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
  onModifications?: (product: CatalogProduct) => void;
  onToggleChildren?: () => void;
}) {
  const [draft, setDraft] = useState(() => productToInput(product));

  useEffect(() => setDraft(productToInput(product)), [product]);

  function setField<K extends keyof CatalogProductInput>(key: K, value: CatalogProductInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return <article className="catalog-row">
    <label className="catalog-row__select" onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" checked={selected} onChange={(event) => onSelect(product, event.target.checked)} aria-label={`Обрати ${product.name}`} />
    </label>
    <div className={`catalog-row__product${childrenCount > 0 ? ' catalog-row__product--expandable' : ''}`}>
      {childrenCount > 0 && <button className="icon-button catalog-row__expand" type="button" title="Розгорнути модифікації" aria-label="Розгорнути модифікації" onClick={(event) => { event.stopPropagation(); onToggleChildren?.(); }}>
        <Icon name={expanded ? 'arrowDown' : 'arrowRight'} />
      </button>}
      <button className="catalog-row__main" type="button" onClick={() => onOpen(product)}>
        <ProductThumb product={product} />
        <span><strong>{product.name}</strong><small>{product.productCode} · {product.conditionLabel}</small></span>
      </button>
    </div>
    <label className="field"><span>Ціна</span><input type="number" min={0} step="0.01" value={draft.priceUah} onChange={(event) => setField('priceUah', Number(event.target.value || 0))} /></label>
    <label className="field"><span>Залишок</span><input type="number" min={0} step={1} value={draft.stockCount} onChange={(event) => setField('stockCount', Number(event.target.value || 0))} /></label>
    <label className="field"><span>В дорозі</span><input type="number" min={0} step={1} value={draft.incomingCount} onChange={(event) => setField('incomingCount', Number(event.target.value || 0))} /></label>
    <div className="catalog-row__status"><StyledSelect value={draft.publicationStatus} options={catalogPublicationStatusOptions} onChange={(value) => setField('publicationStatus', value as CatalogPublicationStatus)} compact /></div>
    <span className={`catalog-availability catalog-availability--${product.availability.status}`}>{product.availability.label}</span>
    <div className="catalog-row__actions">
      {onModifications && <button className="button button--secondary button--small catalog-row__modifications" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onModifications(product); }}>
        <Icon name="variants" size={15} /> Модифікації
      </button>}
      <a className="icon-button catalog-row__preview" href={catalogPreviewPath(product)} target="_blank" rel="noreferrer" title="Відкрити сторінку товару" aria-label="Відкрити сторінку товару" onClick={(event) => event.stopPropagation()}><Icon name="openInNew" /></a>
      <button className="icon-button" type="button" title="Поділитися" aria-label="Поділитися" onClick={(event) => { event.stopPropagation(); onShare(product); }}><Icon name="share" /></button>
      <button className="icon-button icon-button--danger" type="button" title="Видалити" aria-label="Видалити" disabled={busy} onClick={(event) => { event.stopPropagation(); onDelete(product); }}><Icon name="delete" /></button>
      <button className="button button--secondary button--small catalog-row__save" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void onQuickSave(product, draft); }}><Icon name="save" size={15} /> Save</button>
    </div>
  </article>;
}

function ModificationManagerModal({
  product,
  onClose,
  onSaved
}: {
  product: CatalogProduct;
  onClose: () => void;
  onSaved: (product: CatalogProduct) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [currentProduct, setCurrentProduct] = useState(product);
  const [addMode, setAddMode] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setCurrentProduct(product);
    setAddMode(false);
    setSearch('');
  }, [product]);

  const modifications = useQuery<CatalogProductModificationSet>({
    queryKey: ['catalog-product-modifications', currentProduct.id],
    queryFn: () => api.catalog.productModifications(currentProduct.id),
    retry: false
  });
  const currentGroupId = modifications.data?.groupId || currentProduct.modificationGroup?.groupId || null;
  const picker = useQuery<CatalogFeed>({
    queryKey: ['catalog-modification-picker', currentProduct.id, search],
    queryFn: () => api.catalog.list({
      search,
      page: 1,
      pageSize: 100,
      sort: 'name_asc',
      status: 'all',
      condition: 'all',
      availability: 'all'
    }),
    enabled: addMode
  });

  const fallbackItems: Array<CatalogProduct | CatalogProductGroupItem> = useMemo(
    () => [currentProduct, ...(currentProduct.modificationChildren || [])],
    [currentProduct]
  );
  const currentItems = modifications.data?.items.length ? modifications.data.items : fallbackItems;
  const existingVariants = currentItems.filter((item) => item.id !== currentProduct.id);

  useEffect(() => {
    if (modifications.data) {
      setSelectedIds(modifications.data.items.filter((item) => item.id !== currentProduct.id).map((item) => item.id));
      return;
    }
    setSelectedIds((current) => current.length ? current : (currentProduct.modificationChildren || []).map((item) => item.id));
  }, [currentProduct.id, currentProduct.modificationChildren, modifications.data]);

  const saveVariants = useMutation({
    mutationFn: (variantIds: string[] = selectedIds) => api.catalog.updateProductModifications(currentProduct.id, {
      groupId: currentGroupId,
      groupLabel: modifications.data?.groupLabel || currentProduct.name,
      mainProductId: currentProduct.id,
      productIds: [currentProduct.id, ...variantIds],
      expectedVersion: currentProduct.version
    })
  });

  function toggleCandidate(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
  }

  async function applySelection() {
    if (!selectedIds.length && !currentGroupId) {
      showToast('Оберіть хоча б один товар для модифікацій.', 'error');
      return;
    }
    try {
      const saved = await saveVariants.mutateAsync(selectedIds);
      setCurrentProduct(saved);
      setAddMode(false);
      showToast('Модифікації товару оновлено.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product-modifications', currentProduct.id] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product-groups'] }),
        Promise.resolve(onSaved(saved))
      ]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити модифікації.', 'error');
    }
  }

  async function removeVariant(variantId: string) {
    const nextIds = selectedIds.filter((id) => id !== variantId);
    try {
      const saved = await saveVariants.mutateAsync(nextIds);
      setSelectedIds(nextIds);
      setCurrentProduct(saved);
      showToast('Модифікацію видалено з групи.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product-modifications', currentProduct.id] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product-groups'] }),
        Promise.resolve(onSaved(saved))
      ]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити модифікацію.', 'error');
    }
  }

  const candidateRows = (picker.data?.items || []).filter((candidate) => candidate.id !== currentProduct.id);

  return <div className="modal-backdrop" role="presentation">
    <section className={`modal catalog-modifications-modal${addMode ? ' catalog-modifications-modal--picker' : ''}`} role="dialog" aria-modal="true" aria-labelledby="catalog-modifications-title">
      <header className="modal__header">
        <div>
          <p className="eyebrow">Групований товар</p>
          <h2 id="catalog-modifications-title">Модифікації</h2>
          <p>{currentProduct.name}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
      </header>

      {!addMode ? <div className="catalog-modifications-modal__content">
        <article className="catalog-modification-primary">
          <CatalogMiniThumb imageUrl={currentProduct.mainImageUrl} className="catalog-modification-primary__thumb" />
          <span><small>Основний товар</small><strong>{currentProduct.name}</strong><em>{currentProduct.productCode} · {currentProduct.priceLabel}</em></span>
        </article>

        <div className="catalog-modifications-list">
          {existingVariants.map((item) => <article className="catalog-modification-compact" key={item.id}>
            <CatalogMiniThumb imageUrl={item.mainImageUrl} className="catalog-modification-compact__thumb" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.productCode} · {item.priceLabel} · {item.availability.label}</small>
            </span>
            <button className="icon-button icon-button--danger" type="button" disabled={saveVariants.isPending} onClick={() => void removeVariant(item.id)} aria-label="Видалити модифікацію"><Icon name="close" size={22} /></button>
          </article>)}
        </div>
        {!modifications.isLoading && !existingVariants.length && <div className="catalog-editor-notice">
          У цього товару ще немає вкладених модифікацій. Додайте товари-варіанти, щоб вони зʼявились у перемикачах на сторінці товару.
        </div>}
      </div> : <div className="catalog-modification-picker-panel">
        <div className="catalog-modification-picker-panel__bar">
          <label className="field">
            <span>Пошук</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Назва, код або slug" autoFocus />
          </label>
          <span>Обрано {selectedIds.length}</span>
        </div>

        <div className="catalog-modification-card-grid">
          {candidateRows.map((candidate) => {
            const belongsToCurrentGroup = Boolean(currentGroupId && candidate.modificationGroup?.groupId === currentGroupId);
            const belongsToOtherGroup = Boolean(candidate.modificationGroup?.groupId && candidate.modificationGroup.groupId !== currentGroupId);
            const locked = belongsToOtherGroup && !belongsToCurrentGroup;
            const checked = selectedIds.includes(candidate.id);
            return <label className={`catalog-modification-card${checked ? ' catalog-modification-card--selected' : ''}${locked ? ' catalog-modification-card--locked' : ''}`} key={candidate.id}>
              <input type="checkbox" checked={checked} disabled={locked || saveVariants.isPending} onChange={(event) => toggleCandidate(candidate.id, event.target.checked)} />
              <CatalogMiniThumb imageUrl={candidate.mainImageUrl} className="catalog-modification-card__thumb" />
              <span>
                <strong>{candidate.name}</strong>
                <small>{candidate.productCode} · {candidate.conditionLabel} · {candidate.priceLabel}</small>
                {locked && <em>Вже належить до іншої групи</em>}
              </span>
            </label>;
          })}
          {!picker.isLoading && !candidateRows.length && <div className="empty-state catalog-modification-empty">
            <div className="empty-state__icon"><Icon name="phone" size={26} /></div>
            <h2>Нічого не знайдено</h2>
            <p>Спробуйте змінити пошуковий запит.</p>
          </div>}
        </div>
      </div>}

      <footer className="modal__footer">
        {addMode ? <>
          <button className="button button--secondary" type="button" disabled={saveVariants.isPending} onClick={() => setAddMode(false)}>Назад</button>
          <button className="button button--primary" type="button" disabled={saveVariants.isPending} onClick={() => void applySelection()}><Icon name="save" size={17} /> Зберегти вибір</button>
        </> : <>
          <button className="button button--secondary" type="button" onClick={onClose}>Закрити</button>
          <button className="button button--primary" type="button" onClick={() => setAddMode(true)}><Icon name="add" size={17} /> Додати варіанти</button>
        </>}
      </footer>
    </section>
  </div>;
}

function CatalogDeleteProductsModal({
  products,
  busy,
  onClose,
  onConfirm
}: {
  products: CatalogProduct[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (choices: CatalogDeleteChoice[]) => Promise<void>;
}) {
  const selectedIds = useMemo(() => new Set(products.map((product) => product.id)), [products]);
  const groupedMainProducts = useMemo(
    () => products.filter((product) => product.modificationGroup?.isMain && (product.modificationChildren || []).length > 0),
    [products]
  );
  const [groupActions, setGroupActions] = useState<Record<string, CatalogDeleteGroupAction>>({});
  const [promotedIds, setPromotedIds] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextActions: Record<string, CatalogDeleteGroupAction> = {};
    const nextPromoted: Record<string, string> = {};
    groupedMainProducts.forEach((product) => {
      const candidates = (product.modificationChildren || []).filter((child) => !selectedIds.has(child.id));
      nextActions[product.id] = 'disband';
      if (candidates[0]) nextPromoted[product.id] = candidates[0].id;
    });
    setGroupActions(nextActions);
    setPromotedIds(nextPromoted);
  }, [groupedMainProducts, selectedIds]);

  function selectGroupAction(productId: string, action: CatalogDeleteGroupAction) {
    setGroupActions((current) => ({ ...current, [productId]: action }));
  }

  function selectPromotedProduct(productId: string, promotedProductId: string) {
    setGroupActions((current) => ({ ...current, [productId]: 'promote' }));
    setPromotedIds((current) => ({ ...current, [productId]: promotedProductId }));
  }

  async function submitDelete() {
    const choices = products.map((product) => {
      const isMainGroupProduct = product.modificationGroup?.isMain && (product.modificationChildren || []).length > 0;
      if (!isMainGroupProduct) return { product };
      const groupAction = groupActions[product.id] || 'disband';
      return {
        product,
        groupAction,
        newMainProductId: groupAction === 'promote' ? promotedIds[product.id] || null : null
      };
    });
    await onConfirm(choices);
  }

  const title = products.length > 1 ? 'Видалити товари?' : 'Видалити товар?';

  return <div className="modal-backdrop" role="presentation">
    <section className="modal catalog-delete-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-delete-title">
      <header className="modal__header">
        <div>
          <p className="eyebrow">Архівація</p>
          <h2 id="catalog-delete-title">{title}</h2>
          <p>{products.length > 1 ? `Буде видалено з активного каталогу: ${products.length}` : products[0]?.name}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>

      <div className="catalog-delete-modal__content">
        <div className="catalog-editor-notice catalog-delete-modal__notice">
          Товари будуть перенесені в архів і зникнуть з активного каталогу. Дочірні товари групи не видаляються автоматично.
        </div>

        <div className="catalog-delete-products">
          {products.map((product) => <article className="catalog-delete-product" key={product.id}>
            <CatalogMiniThumb imageUrl={product.mainImageUrl} className="catalog-delete-product__thumb" />
            <span>
              <strong>{product.name}</strong>
              <small>{product.productCode} · {product.publicationStatusLabel}</small>
            </span>
          </article>)}
        </div>

        {groupedMainProducts.map((product) => {
          const children = product.modificationChildren || [];
          const candidates = children.filter((child) => !selectedIds.has(child.id));
          const action = groupActions[product.id] || 'disband';
          return <section className="catalog-delete-group" key={product.id}>
            <header>
              <Icon name="variants" size={20} />
              <div>
                <strong>Основний товар групи буде видалено</strong>
                <p>Група “{product.modificationGroup?.groupLabel || product.name}” зміниться. Оберіть, що зробити з товарами всередині групи.</p>
              </div>
            </header>
            <div className="catalog-delete-group__products">
              {[product, ...children].map((item) => <article className="catalog-delete-product catalog-delete-product--compact" key={item.id}>
                <CatalogMiniThumb imageUrl={item.mainImageUrl} className="catalog-delete-product__thumb" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.id === product.id ? 'Поточний основний' : 'Модифікація'}</small>
                </span>
              </article>)}
            </div>
            <div className="catalog-delete-options">
              <label className={`catalog-delete-option${action === 'disband' ? ' active' : ''}`}>
                <input type="radio" name={`group-action-${product.id}`} checked={action === 'disband'} onChange={() => selectGroupAction(product.id, 'disband')} />
                <span>
                  <strong>Розформувати групу</strong>
                  <small>Усі товари групи стануть одиночними товарами.</small>
                </span>
              </label>
              <label className={`catalog-delete-option${action === 'promote' ? ' active' : ''}${!candidates.length ? ' disabled' : ''}`}>
                <input type="radio" name={`group-action-${product.id}`} checked={action === 'promote'} disabled={!candidates.length} onChange={() => selectGroupAction(product.id, 'promote')} />
                <span>
                  <strong>Призначити новий основний товар</strong>
                  <small>{candidates.length ? 'Оберіть одну з модифікацій, яка стане головною.' : 'Немає доступних товарів для призначення.'}</small>
                </span>
              </label>
              {candidates.length > 0 && <div className="catalog-delete-promote-list">
                {candidates.map((child) => <label className={`catalog-delete-promote${action === 'promote' && promotedIds[product.id] === child.id ? ' active' : ''}`} key={child.id}>
                  <input type="checkbox" checked={promotedIds[product.id] === child.id && action === 'promote'} onChange={() => selectPromotedProduct(product.id, child.id)} />
                  <CatalogMiniThumb imageUrl={child.mainImageUrl} className="catalog-delete-product__thumb" />
                  <span>
                    <strong>{child.name}</strong>
                    <small>{child.productCode} · {child.priceLabel}</small>
                  </span>
                </label>)}
              </div>}
            </div>
          </section>;
        })}
      </div>

      <footer className="modal__footer">
        <button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Скасувати</button>
        <button className="button button--danger" type="button" disabled={busy} onClick={() => void submitDelete()}><Icon name="delete" size={17} /> Видалити</button>
      </footer>
    </section>
  </div>;
}

function ImportModal({
  busy,
  preview,
  onClose,
  onPreview,
  onCommit
}: {
  busy: boolean;
  preview: CatalogImportPreview | null;
  onClose: () => void;
  onPreview: (rows: Array<Record<string, unknown>>) => Promise<void>;
  onCommit: (rows: Array<Record<string, unknown>>, options: { importNew: boolean; updateExisting: boolean }) => Promise<void>;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [importNew, setImportNew] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [fileName, setFileName] = useState('');

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const sheet = firstSheet ? workbook.Sheets[firstSheet] : null;
    const parsed = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
    setRows(parsed);
    await onPreview(parsed);
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="modal catalog-import-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-import-title">
      <header className="modal__header">
        <div><p className="eyebrow">XLSX</p><h2 id="catalog-import-title">Імпорт залишків</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      <div className="catalog-import-modal__content">
        <label className="field"><span>Файл</span><input type="file" accept=".xlsx,.xls" onChange={(event) => void readFile(event)} /></label>
        {fileName && <p className="catalog-import-modal__file">{fileName} · {rows.length} рядків</p>}
        <div className="catalog-import-options">
          <label><input type="checkbox" checked={importNew} onChange={(event) => setImportNew(event.target.checked)} /> Створювати нові товари</label>
          <label><input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} /> Оновлювати наявні товари</label>
        </div>
        {preview && <div className="catalog-import-summary">
          <span>Нові <strong>{preview.summary.create}</strong></span>
          <span>Оновити <strong>{preview.summary.update}</strong></span>
          <span>Конфлікти <strong>{preview.summary.conflict}</strong></span>
          <span>Помилки <strong>{preview.summary.error}</strong></span>
        </div>}
        {preview?.rows.length ? <div className="catalog-import-table">
          {preview.rows.slice(0, 80).map((row) => <div className={`catalog-import-table__row catalog-import-table__row--${row.action}`} key={`${row.rowNumber}-${row.name}`}>
            <span>{row.rowNumber}</span>
            <strong>{row.name || 'Без назви'}</strong>
            <span>{row.conditionLabel || row.condition || '-'}</span>
            <span>{row.stockCount ?? '-'}/{row.incomingCount ?? '-'}</span>
            <span>{row.priceUah ?? '-'}</span>
            <b>{importActionLabel(row)}</b>
            {row.reason && <small>{row.reason}</small>}
          </div>)}
        </div> : null}
      </div>
      <footer className="modal__footer">
        <button className="button button--secondary" type="button" onClick={onClose}>Закрити</button>
        <button className="button button--primary" type="button" disabled={busy || !rows.length} onClick={() => void onCommit(rows, { importNew, updateExisting })}><Icon name="upload" size={17} /> Застосувати імпорт</button>
      </footer>
    </section>
  </div>;
}

export function UsedSmartphonesCatalogPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState<CatalogCondition | 'all'>('all');
  const [status, setStatus] = useState<CatalogPublicationStatus | 'all'>('all');
  const [availability, setAvailability] = useState<CatalogAvailabilityStatus | 'all'>('all');
  const [sort, setSort] = useState('updated_desc');
  const [page, setPage] = useState(1);
  const [editorProduct, setEditorProduct] = useState<CatalogProduct | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<CatalogImportPreview | null>(null);
  const [settingsFormId, setSettingsFormId] = useState('');
  const [settingsOrigin, setSettingsOrigin] = useState('');
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [modificationProduct, setModificationProduct] = useState<CatalogProduct | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<CatalogPublicationStatus>('DRAFT');
  const [deleteProducts, setDeleteProducts] = useState<CatalogProduct[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const sharedProductId = searchParams.get('product');
  const queryParams = useMemo(() => ({ search, condition, status, availability, sort, page, pageSize: 25 }), [availability, condition, page, search, sort, status]);

  const products = useQuery<CatalogFeed>({
    queryKey: ['catalog-products', queryParams],
    queryFn: () => api.catalog.list(queryParams),
    refetchOnMount: 'always'
  });
  const summary = useQuery({ queryKey: ['catalog-summary'], queryFn: api.catalog.summary });
  const brands = useQuery({ queryKey: ['catalog-brands'], queryFn: () => api.catalog.brands() });
  const brandDirectories = useQuery({ queryKey: ['catalog-brand-directories'], queryFn: api.catalog.brandDirectories });
  const forms = useQuery({ queryKey: ['forms'], queryFn: api.forms.list });
  const storefrontSettings = useQuery({ queryKey: ['catalog-storefront-settings'], queryFn: api.catalog.storefrontSettings });
  const sharedProduct = useQuery({
    queryKey: ['catalog-product', sharedProductId],
    queryFn: () => api.catalog.get(sharedProductId!),
    enabled: Boolean(sharedProductId),
    retry: false
  });

  const saveProduct = useMutation({
    mutationFn: ({ product, input }: { product: CatalogProduct | null; input: CatalogProductInput }) => (
      product
        ? api.catalog.update(product.id, { ...input, expectedVersion: product.version })
        : api.catalog.create(input)
    )
  });
  const removeProduct = useMutation({
    mutationFn: ({ product, groupAction, newMainProductId }: CatalogDeleteChoice) =>
      api.catalog.remove(product.id, product.version, { groupAction, newMainProductId })
  });
  const previewImport = useMutation({ mutationFn: api.catalog.previewImport });
  const commitImport = useMutation({
    mutationFn: ({ rows, options }: { rows: Array<Record<string, unknown>>; options: { importNew: boolean; updateExisting: boolean } }) =>
      api.catalog.commitImport(rows, options)
  });
  const updateSettings = useMutation({ mutationFn: api.catalog.updateStorefrontSettings });
  const busy = saveProduct.isPending || removeProduct.isPending || commitImport.isPending || updateSettings.isPending || bulkBusy;

  useEffect(() => {
    if (!storefrontSettings.data) return;
    setSettingsFormId(storefrontSettings.data.selectedFormPublicId || '');
    setSettingsOrigin(storefrontSettings.data.publicOrigin || '');
  }, [storefrontSettings.data]);

  useEffect(() => {
    if (sharedProduct.data) setEditorProduct(sharedProduct.data);
  }, [sharedProduct.data]);

  useEffect(() => {
    if (!sharedProductId || !sharedProduct.error) return;
    showToast(sharedProduct.error instanceof Error ? sharedProduct.error.message : 'Не вдалося відкрити товар за посиланням.', 'error');
    const next = new URLSearchParams(searchParams);
    next.delete('product');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, sharedProduct.error, sharedProductId, showToast]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-product'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-product-modifications'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-product-groups'] }),
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] })
    ]);
  }

  function openProduct(product: CatalogProduct) {
    setEditorProduct(product);
    const next = new URLSearchParams(searchParams);
    next.set('product', product.id);
    setSearchParams(next, { replace: true });
  }

  async function switchEditorProduct(productId: string) {
    try {
      const product = await api.catalog.get(productId);
      setEditorProduct(product);
      const next = new URLSearchParams(searchParams);
      next.set('product', product.id);
      setSearchParams(next, { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відкрити товар групи.', 'error');
    }
  }

  function closeEditor() {
    setEditorProduct(undefined);
    if (!searchParams.has('product')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('product');
    setSearchParams(next, { replace: true });
  }

  async function submitProduct(input: CatalogProductInput, product: CatalogProduct | null) {
    try {
      const saved = await saveProduct.mutateAsync({ product, input });
      showToast(product ? 'Товар оновлено.' : 'Товар створено.');
      setEditorProduct(saved);
      await refresh();
      return saved;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти товар.', 'error');
      return null;
    }
  }

  async function quickSave(product: CatalogProduct, input: CatalogProductInput) {
    try {
      await saveProduct.mutateAsync({ product, input });
      showToast('Товар оновлено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти товар.', 'error');
    }
  }

  async function shareProduct(product: CatalogProduct) {
    try {
      await copyShareLink('catalog_product', product.id);
      showToast('Посилання на товар скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  function deleteCatalogProduct(product: CatalogProduct) {
    setDeleteProducts([product]);
  }

  async function confirmDeleteCatalogProducts(choices: CatalogDeleteChoice[]) {
    try {
      setBulkBusy(true);
      for (const choice of choices) {
        await removeProduct.mutateAsync(choice);
      }
      showToast(choices.length > 1 ? 'Товари видалено з каталогу.' : 'Товар видалено з каталогу.');
      if (modificationProduct && choices.some((choice) => choice.product.id === modificationProduct.id)) setModificationProduct(null);
      setDeleteProducts(null);
      setSelectedProductIds((current) => current.filter((id) => !choices.some((choice) => choice.product.id === id)));
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити товар.', 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkChangePublicationStatus(productsToUpdate: CatalogProduct[]) {
    if (!productsToUpdate.length) return;
    try {
      setBulkBusy(true);
      for (const product of productsToUpdate) {
        await saveProduct.mutateAsync({
          product,
          input: { ...productToInput(product), publicationStatus: bulkStatus }
        });
      }
      showToast('Статус вибраних товарів оновлено.');
      setSelectedProductIds([]);
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус вибраних товарів.', 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  function downloadImportTemplate() {
    const headers = ['Назва', 'Статус', 'Залишок', 'В дорозі', 'Ціна'];
    const rows = [
      { 'Назва': 'iPhone 13 128GB Midnight', 'Статус': 'Вживаний', 'Залишок': 1, 'В дорозі': 0, 'Ціна': 18999 },
      { 'Назва': 'Samsung Galaxy S22 128GB Black', 'Статус': 'Відновлений', 'Залишок': 0, 'В дорозі': 3, 'Ціна': 20999 }
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Імпорт');
    const help = XLSX.utils.aoa_to_sheet([
      ['Колонка', 'Правило'],
      ['Назва', 'Назва товару або моделі. Разом зі статусом використовується для пошуку наявного товару.'],
      ['Статус', 'Вживаний або Відновлений. Також можна USED або REFURBISHED.'],
      ['Залишок', 'Ціле число 0 або більше.'],
      ['В дорозі', 'Ціле число 0 або більше.'],
      ['Ціна', 'Число 0 або більше у гривнях.']
    ]);
    help['!cols'] = [{ wch: 18 }, { wch: 78 }];
    XLSX.utils.book_append_sheet(workbook, help, 'Довідка');
    XLSX.writeFile(workbook, 'used-smartphones-import-template.xlsx');
  }

  async function runPreview(rows: Array<Record<string, unknown>>) {
    try {
      setImportPreview(await previewImport.mutateAsync(rows));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося перевірити імпорт.', 'error');
    }
  }

  async function runCommit(rows: Array<Record<string, unknown>>, options: { importNew: boolean; updateExisting: boolean }) {
    try {
      const result = await commitImport.mutateAsync({ rows, options });
      setImportPreview(result);
      showToast('Імпорт застосовано.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося застосувати імпорт.', 'error');
    }
  }

  async function saveSettings() {
    try {
      await updateSettings.mutateAsync({ selectedFormPublicId: settingsFormId || null, publicOrigin: settingsOrigin });
      showToast('Налаштування вітрини збережено.');
      await queryClient.invalidateQueries({ queryKey: ['catalog-storefront-settings'] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти налаштування вітрини.', 'error');
    }
  }

  const rows = products.data?.items || [];
  const rowIds = new Set(rows.map((product) => product.id));
  const topRows = rows.filter((product) => (
    !product.modificationGroup
    || product.modificationGroup.isMain
    || !product.modificationGroup.mainProductId
    || !rowIds.has(product.modificationGroup.mainProductId)
  ));
  const loadedRows = useMemo(() => rows.flatMap((product) => [product, ...(product.modificationChildren || [])]), [rows]);
  const loadedProductById = useMemo(() => new Map(loadedRows.map((product) => [product.id, product])), [loadedRows]);
  const visibleRows = useMemo(() => topRows.flatMap((product) => {
    const groupId = product.modificationGroup?.groupId || '';
    const children = groupId && expandedGroupIds.includes(groupId) ? product.modificationChildren || [] : [];
    return [product, ...children];
  }), [expandedGroupIds, topRows]);
  const selectedProducts = selectedProductIds.map((id) => loadedProductById.get(id)).filter((product): product is CatalogProduct => Boolean(product));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((product) => selectedProductIds.includes(product.id));
  const publishedForms = (forms.data || []).filter((form) => form.status === 'published');

  useEffect(() => {
    const loadedIds = new Set(loadedRows.map((product) => product.id));
    setSelectedProductIds((current) => {
      const next = current.filter((id) => loadedIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [loadedRows]);

  function selectCatalogProduct(product: CatalogProduct, selected: boolean) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (selected) next.add(product.id);
      else next.delete(product.id);
      return [...next];
    });
  }

  function selectVisibleProducts(selected: boolean) {
    const visibleIds = visibleRows.map((product) => product.id);
    setSelectedProductIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return [...next];
    });
  }

  if (editorProduct !== undefined) {
    return <ProductEditorScreen
      product={editorProduct}
      brands={brands.data || []}
      brandDirectories={brandDirectories.data || []}
      busy={saveProduct.isPending}
      onClose={closeEditor}
      onSubmit={submitProduct}
      onProductUpdated={async (saved) => {
        setEditorProduct(saved);
        await refresh();
      }}
      onSwitchProduct={switchEditorProduct}
    />;
  }

  return <div className="catalog-page">
    <section className="task-toolbar">
      <div>
        <p className="eyebrow">Storefront catalog</p>
        <h1>Каталог смартфонів</h1>
      </div>
      <div className="task-toolbar__controls">
        <a className="button button--secondary" href="/catalog/preview/storefront" target="_blank" rel="noreferrer"><Icon name="openInNew" /> Відкрити вітрину</a>
        <button className="button button--secondary" type="button" onClick={downloadImportTemplate}><Icon name="productTables" /> Шаблон XLSX</button>
        <button className="button button--secondary" type="button" onClick={() => { setImportPreview(null); setImportOpen(true); }}><Icon name="upload" /> Імпорт XLSX</button>
        <button className="button button--primary" type="button" onClick={() => setEditorProduct(null)}><Icon name="add" /> Новий товар</button>
      </div>
    </section>

    <section className="catalog-summary">
      {summaryCards(summary.data).map((card) => <article className={`admin-summary__card${card.tone ? ` admin-summary__card--${card.tone}` : ''}`} key={card.label}>
        <span>{card.label}</span>
        <strong>{card.value}</strong>
      </article>)}
    </section>

    <section className="catalog-storefront-settings">
      <label className="field"><span>Форма заявок вітрини</span><StyledSelect value={settingsFormId} options={[{ value: '', label: 'Не обрано' }, ...publishedForms.map((form) => ({ value: form.publicId, label: form.name }))]} onChange={(value) => setSettingsFormId(String(value))} /></label>
      <label className="field"><span>Публічний origin</span><input value={settingsOrigin} onChange={(event) => setSettingsOrigin(event.target.value)} placeholder="https://example.com" /></label>
      <button className="button button--secondary" type="button" disabled={busy} onClick={() => void saveSettings()}><Icon name="save" size={16} /> Зберегти</button>
    </section>

    <section className="catalog-filters">
      <label className="field"><span>Пошук</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Назва, код або slug" /></label>
      <StyledSelect value={condition} options={conditionFilterOptions} onChange={(value) => { setCondition(value as CatalogCondition | 'all'); setPage(1); }} />
      <StyledSelect value={status} options={statusFilterOptions} onChange={(value) => { setStatus(value as CatalogPublicationStatus | 'all'); setPage(1); }} />
      <StyledSelect value={availability} options={availabilityFilterOptions} onChange={(value) => { setAvailability(value as CatalogAvailabilityStatus | 'all'); setPage(1); }} />
      <StyledSelect value={sort} options={sortOptions} onChange={(value) => setSort(String(value))} />
    </section>

    <section className="catalog-table">
      {selectedProducts.length > 0 && <div className="catalog-bulk-bar">
        <div className="catalog-bulk-bar__summary">
          <strong>{selectedProducts.length} вибрано</strong>
          <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => setSelectedProductIds([])}>Скинути</button>
        </div>
        <div className="catalog-bulk-bar__actions">
          <StyledSelect value={bulkStatus} options={catalogPublicationStatusOptions} onChange={(value) => setBulkStatus(value as CatalogPublicationStatus)} compact />
          <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => void bulkChangePublicationStatus(selectedProducts)}><Icon name="publication" size={15} /> Змінити статус</button>
          <button className="button button--danger button--small" type="button" disabled={busy} onClick={() => setDeleteProducts(selectedProducts)}><Icon name="delete" size={15} /> Видалити</button>
        </div>
      </div>}
      <div className="catalog-table__head">
        <label className="catalog-row__select catalog-row__select--head">
          <input type="checkbox" checked={allVisibleSelected} disabled={!visibleRows.length} onChange={(event) => selectVisibleProducts(event.target.checked)} aria-label="Обрати всі видимі товари" />
        </label>
        <span>Товар</span><span>Ціна</span><span>Залишок</span><span>В дорозі</span><span>Статус</span><span>Наявність</span><span>Дії</span>
      </div>
      {topRows.map((product) => {
        const groupId = product.modificationGroup?.groupId || '';
        const children = product.modificationChildren || [];
        const expanded = Boolean(groupId && expandedGroupIds.includes(groupId));
        return <div className="catalog-row-group" key={product.id}>
          <CatalogRow
            product={product}
            busy={busy}
            selected={selectedProductIds.includes(product.id)}
            childrenCount={children.length}
            expanded={expanded}
            onSelect={selectCatalogProduct}
            onToggleChildren={() => setExpandedGroupIds((current) => (
              current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
            ))}
            onOpen={openProduct}
            onQuickSave={quickSave}
            onShare={(item) => void shareProduct(item)}
            onDelete={(item) => void deleteCatalogProduct(item)}
            onModifications={!isChildModification(product) ? setModificationProduct : undefined}
          />
          {expanded && children.length > 0 && <div className="catalog-row-children">
            {children.map((child) => <CatalogRow
              key={child.id}
              product={child}
              busy={busy}
              selected={selectedProductIds.includes(child.id)}
              onSelect={selectCatalogProduct}
              onOpen={openProduct}
              onQuickSave={quickSave}
              onShare={(item) => void shareProduct(item)}
              onDelete={(item) => void deleteCatalogProduct(item)}
            />)}
          </div>}
        </div>;
      })}
      {!products.isLoading && !rows.length && <div className="empty-state">
        <div className="empty-state__icon"><Icon name="phone" size={28} /></div>
        <h2>Каталог поки порожній</h2>
        <p>Створіть товар вручну або завантажте XLSX з колонками Назва, Статус, Залишок, В дорозі, Ціна.</p>
      </div>}
      <div className="task-list__summary">
        <span>{products.data ? `${products.data.total} товарів · сторінка ${products.data.page} з ${products.data.pageCount}` : 'Завантаження...'}</span>
        <div className="catalog-pagination">
          <button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="arrowLeft" size={14} /> Назад</button>
          <button className="button button--secondary button--small" type="button" disabled={!products.data || page >= products.data.pageCount} onClick={() => setPage((current) => current + 1)}>Далі <Icon name="arrowRight" size={14} /></button>
        </div>
      </div>
    </section>
    {importOpen && <ImportModal
      busy={previewImport.isPending || commitImport.isPending}
      preview={importPreview}
      onClose={() => setImportOpen(false)}
      onPreview={runPreview}
      onCommit={runCommit}
    />}
    {modificationProduct && <ModificationManagerModal
      product={modificationProduct}
      onClose={() => setModificationProduct(null)}
      onSaved={async () => {
        await refresh();
      }}
    />}
    {deleteProducts && <CatalogDeleteProductsModal
      products={deleteProducts}
      busy={busy}
      onClose={() => setDeleteProducts(null)}
      onConfirm={confirmDeleteCatalogProducts}
    />}
  </div>;
}
