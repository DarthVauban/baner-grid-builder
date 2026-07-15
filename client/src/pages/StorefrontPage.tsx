import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { catalogConditionOptions } from '../lib/catalog';
import type { CatalogAvailabilityStatus, CatalogCondition, CatalogProduct } from '../types/catalog';

type PublicForm = Awaited<ReturnType<typeof api.storefront.form>>;
type PublicField = PublicForm['fields'][number];
type StorefrontGalleryImage = { url: string; alt: string };

const availabilityOptions: Array<{ value: CatalogAvailabilityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Уся наявність' },
  { value: 'in_stock', label: 'В наявності' },
  { value: 'incoming', label: 'В дорозі' },
  { value: 'unavailable', label: 'Немає' }
];
const conditionOptions = [{ value: 'all', label: 'Усі' }, ...catalogConditionOptions];
const sortOptions = [
  { value: 'updated_desc', label: 'Нові оновлення' },
  { value: 'name_asc', label: 'Назва А-Я' },
  { value: 'price_asc', label: 'Дешевші спочатку' },
  { value: 'price_desc', label: 'Дорожчі спочатку' }
];

function ProductImage({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.mainImageUrl]);
  return <span className="storefront-product-image">
    {product.mainImageUrl && !failed
      ? <img src={product.mainImageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} />
      : <Icon name="phone" size={34} />}
  </span>;
}

function productGalleryImages(product: CatalogProduct): StorefrontGalleryImage[] {
  const images: StorefrontGalleryImage[] = [];
  if (product.mainImageUrl) images.push({ url: product.mainImageUrl, alt: product.name });
  (product.gallery || []).forEach((item) => {
    if (!item.url || images.some((image) => image.url === item.url)) return;
    images.push({ url: item.url, alt: item.alt || product.name });
  });
  return images;
}

function StorefrontGalleryLightbox({
  images,
  index,
  onIndex,
  onClose
}: {
  images: StorefrontGalleryImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const current = images[index] || images[0];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') onIndex((index + 1) % images.length);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, index, onClose, onIndex]);

  if (!current) return null;

  return <div className="storefront-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Перегляд фото" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <button className="storefront-gallery-lightbox__close" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={24} /></button>
    {images.length > 1 && <button className="storefront-gallery-lightbox__arrow storefront-gallery-lightbox__arrow--prev" type="button" onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="Попереднє фото"><Icon name="chevronLeft" size={34} /></button>}
    <figure>
      <img src={current.url} alt={current.alt} />
      {images.length > 1 && <figcaption>{index + 1} / {images.length}</figcaption>}
    </figure>
    {images.length > 1 && <button className="storefront-gallery-lightbox__arrow storefront-gallery-lightbox__arrow--next" type="button" onClick={() => onIndex((index + 1) % images.length)} aria-label="Наступне фото"><Icon name="chevronRight" size={34} /></button>}
  </div>;
}

function ProductGallery({ product }: { product: CatalogProduct }) {
  const images = useMemo(() => productGalleryImages(product), [product]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const active = images[activeIndex] || images[0];

  useEffect(() => {
    setActiveIndex(0);
    setLightboxIndex(null);
  }, [product.productCode]);

  if (!active) return <span className="storefront-product-image storefront-product-image--gallery"><Icon name="phone" size={34} /></span>;

  function move(delta: -1 | 1) {
    setActiveIndex((current) => (current + delta + images.length) % images.length);
  }

  return <div className="storefront-gallery">
    <div className="storefront-gallery__stage-wrap">
      <button className="storefront-gallery__stage" type="button" onClick={() => setLightboxIndex(activeIndex)} aria-label="Відкрити фото на весь екран">
        <img src={active.url} alt={active.alt} loading="lazy" />
      </button>
      {images.length > 1 && <>
        <button className="storefront-gallery__arrow storefront-gallery__arrow--prev" type="button" onClick={() => move(-1)} aria-label="Попереднє фото"><Icon name="chevronLeft" size={24} /></button>
        <button className="storefront-gallery__arrow storefront-gallery__arrow--next" type="button" onClick={() => move(1)} aria-label="Наступне фото"><Icon name="chevronRight" size={24} /></button>
        <span className="storefront-gallery__count">{activeIndex + 1} / {images.length}</span>
      </>}
    </div>
    {images.length > 1 && <div className="storefront-gallery__thumbs" aria-label="Фото товару">
      {images.map((image, index) => <button className={index === activeIndex ? 'active' : ''} type="button" onClick={() => setActiveIndex(index)} key={`${image.url}-${index}`} aria-label={`Фото ${index + 1}`}>
        <img src={image.url} alt="" loading="lazy" />
      </button>)}
    </div>}
    {lightboxIndex !== null && <StorefrontGalleryLightbox images={images} index={lightboxIndex} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />}
  </div>;
}

function productPath(slug: string, preview: boolean) {
  const encodedSlug = encodeURIComponent(slug);
  return preview ? `/catalog/preview/storefront/smartphones/${encodedSlug}` : `/storefront/smartphones/${encodedSlug}`;
}

function productLink(product: Pick<CatalogProduct, 'slug'>, preview: boolean) {
  return productPath(product.slug, preview);
}

function StorefrontDescription({ product }: { product: CatalogProduct }) {
  const html = product.descriptionHtml || '';
  if (!html) return null;
  const css = product.descriptionCss || '';
  const js = product.descriptionJs || '';
  if (css || js || product.descriptionHasJs) {
    const safeCss = css.replace(/<\/style/gi, '<\\/style');
    const safeJs = js.replace(/<\/script/gi, '<\\/script');
    const srcDoc = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;padding:20px;font:15px/1.65 Arial,sans-serif;color:#111827;background:#fff}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:8px}a{color:#0f766e}${safeCss}</style></head><body>${html}<script>${safeJs}</script></body></html>`;
    return <section className="storefront-description storefront-description--sandbox">
      <iframe title="Опис товару" sandbox="allow-scripts" srcDoc={srcDoc} />
    </section>;
  }
  return <section className="storefront-description" dangerouslySetInnerHTML={{ __html: html }} />;
}

function baseSpecItems(product: CatalogProduct) {
  return [
    { label: 'Корпус', value: product.bodyCondition },
    { label: 'Дисплей', value: product.displayCondition },
    { label: 'Акумулятор', value: product.batteryHealth },
    { label: 'Гарантія', value: product.warranty }
  ].filter((item) => item.value);
}

function StorefrontCharacteristics({ product }: { product: CatalogProduct }) {
  const items = product.characteristics?.items || [];
  if (!items.length) return null;
  return <section className="storefront-characteristics">
    <h2>Характеристики</h2>
    <dl>
      {items.map((item) => <div key={item.key}>
        <dt>{item.label}</dt>
        <dd>{item.displayValue}</dd>
      </div>)}
    </dl>
  </section>;
}

function StorefrontModifications({ product, preview }: { product: CatalogProduct; preview: boolean }) {
  const parameters = (product.modifications?.parameters || []).filter((parameter) => parameter.options.length);
  if (!parameters.length) return null;
  return <div className="storefront-modifications" aria-label="Модифікації товару">
    {parameters.map((parameter) => <div className="storefront-modification" key={parameter.id}>
      <span className="storefront-modification__label">{parameter.label}</span>
      <div className="storefront-modification__options">
        {parameter.options.map((option) => {
          const className = `storefront-modification__option${option.selected ? ' storefront-modification__option--active' : ''}${option.product ? '' : ' storefront-modification__option--disabled'}`;
          if (option.selected) {
            return <button className={className} type="button" disabled key={option.id}>{option.label}</button>;
          }
          if (option.product) {
            return <Link className={className} to={productLink(option.product, preview)} key={option.id}>{option.label}</Link>;
          }
          return <span className={className} key={option.id}>{option.label}</span>;
        })}
      </div>
    </div>)}
  </div>;
}

function schemaAvailability(status: CatalogAvailabilityStatus) {
  if (status === 'in_stock') return 'https://schema.org/InStock';
  if (status === 'incoming') return 'https://schema.org/PreOrder';
  return 'https://schema.org/OutOfStock';
}

function schemaCondition(condition: CatalogCondition) {
  return condition === 'REFURBISHED' ? 'https://schema.org/RefurbishedCondition' : 'https://schema.org/UsedCondition';
}

function StorefrontProductJsonLd({ product }: { product: CatalogProduct }) {
  const json = useMemo(() => {
    const url = typeof window !== 'undefined' ? window.location.href : product.publicPath;
    const additionalProperty = [
      ...baseSpecItems(product).map((item) => ({
        '@type': 'PropertyValue',
        name: item.label,
        value: item.value
      })),
      ...(product.characteristics?.items || []).map((item) => ({
        '@type': 'PropertyValue',
        name: item.label,
        propertyID: item.key,
        value: item.displayValue,
        unitText: item.unit || undefined
      })),
      ...(product.modifications?.parameters || []).filter((parameter) => parameter.currentValueLabel).map((parameter) => ({
        '@type': 'PropertyValue',
        name: parameter.label,
        propertyID: parameter.key,
        value: parameter.currentValueLabel
      }))
    ];
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: product.productCode,
      image: [product.mainImageUrl, ...(product.gallery || []).map((item) => item.url)].filter(Boolean),
      description: product.seoDescription || product.shortDescription || product.name,
      brand: product.brand?.label ? { '@type': 'Brand', name: product.brand.label } : undefined,
      itemCondition: schemaCondition(product.condition),
      additionalProperty,
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'UAH',
        price: product.priceUah,
        availability: schemaAvailability(product.availability.status),
        itemCondition: schemaCondition(product.condition)
      }
    };
  }, [product]);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

function fieldValue(values: Record<string, unknown>, field: PublicField) {
  const value = values[field.key];
  if (field.type === 'checkbox') return Array.isArray(value) ? value.map(String) : [];
  return value == null ? '' : String(value);
}

function PublicFieldControl({
  field,
  values,
  onChange
}: {
  field: PublicField;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (field.type === 'textarea') {
    return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><textarea required={field.required} placeholder={field.placeholder} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)} /></label>;
  }
  if (field.type === 'select' || field.systemFieldType === 'bank') {
    return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><select required={field.required} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)}>
      <option value="">Оберіть</option>
      {field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select></label>;
  }
  if (field.type === 'radio') {
    return <fieldset className="storefront-choice"><legend>{field.label}{field.required ? ' *' : ''}</legend>{field.options.map((option) => <label key={option.value}><input type="radio" name={field.key} required={field.required} checked={fieldValue(values, field) === option.value} onChange={() => onChange(field.key, option.value)} /> {option.label}</label>)}</fieldset>;
  }
  if (field.type === 'checkbox') {
    const current = new Set(fieldValue(values, field) as string[]);
    return <fieldset className="storefront-choice"><legend>{field.label}{field.required ? ' *' : ''}</legend>{field.options.map((option) => <label key={option.value}><input type="checkbox" checked={current.has(option.value)} onChange={(event) => {
      const next = new Set(current);
      if (event.target.checked) next.add(option.value);
      else next.delete(option.value);
      onChange(field.key, [...next]);
    }} /> {option.label}</label>)}</fieldset>;
  }
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text';
  return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><input type={inputType} required={field.required} placeholder={field.placeholder} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)} /></label>;
}

function StorefrontApplicationForm({
  product,
  form
}: {
  product: CatalogProduct;
  form: PublicForm | undefined;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<{ number: string } | null>(null);
  const submit = useMutation({
    mutationFn: () => api.storefront.submitApplication(product.slug, {
      values,
      context: {
        sourceUrl: window.location.href,
        pageTitle: document.title,
        referrer: document.referrer
      },
      idempotencyKey: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    })
  });

  function setField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await submit.mutateAsync();
    setDone({ number: result.number });
  }

  if (!form) return <section className="storefront-form storefront-form--empty"><h2>Заявка тимчасово недоступна</h2><p>Для вітрини ще не обрано активну форму.</p></section>;
  if (done) return <section className="storefront-form storefront-form--done"><h2>{form.successMessage || 'Заявку надіслано'}</h2><strong>№{done.number}</strong></section>;

  return <form className="storefront-form" onSubmit={(event) => void handleSubmit(event)}>
    <div><h2>{form.title}</h2>{form.description && <p>{form.description}</p>}</div>
    {form.fields.map((field) => <PublicFieldControl field={field} values={values} onChange={setField} key={field.key} />)}
    {submit.error && <p className="form-message form-message--error">{submit.error instanceof Error ? submit.error.message : 'Не вдалося надіслати заявку.'}</p>}
    <button className="button button--primary" type="submit" disabled={submit.isPending}>{form.buttonText || 'Надіслати'} <Icon name="arrowRight" size={16} /></button>
  </form>;
}

function StorefrontApplicationModal({
  product,
  form,
  onClose
}: {
  product: CatalogProduct;
  form: PublicForm | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return <div className="storefront-modal" role="dialog" aria-modal="true" aria-label="Оформлення заявки" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="storefront-modal__panel">
      <button className="storefront-modal__close" type="button" aria-label="Закрити форму" onClick={onClose}>×</button>
      <StorefrontApplicationForm product={product} form={form} />
    </div>
  </div>;
}

export function StorefrontPage({ preview = false }: { preview?: boolean }) {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [condition, setCondition] = useState<CatalogCondition | 'all'>('all');
  const [availability, setAvailability] = useState<CatalogAvailabilityStatus | 'all'>('all');
  const [sort, setSort] = useState('updated_desc');
  const [requestOpen, setRequestOpen] = useState(false);
  const params = useMemo(() => ({ search, condition, availability, sort, page: 1, pageSize: 24 }), [availability, condition, search, sort]);
  const basePath = preview ? '/catalog/preview/storefront' : '/storefront';
  const settings = useQuery({
    queryKey: [preview ? 'storefront-preview-settings' : 'storefront-settings'],
    queryFn: preview ? api.storefront.previewSettings : api.storefront.settings
  });
  const products = useQuery({
    queryKey: [preview ? 'storefront-preview-products' : 'storefront-products', params],
    queryFn: () => preview ? api.storefront.previewList(params) : api.storefront.list(params),
    enabled: !slug
  });
  const product = useQuery({
    queryKey: [preview ? 'storefront-preview-product' : 'storefront-product', slug],
    queryFn: () => preview ? api.storefront.previewGet(slug!) : api.storefront.get(slug!),
    enabled: Boolean(slug),
    retry: false
  });
  const form = useQuery({
    queryKey: ['storefront-form', settings.data?.selectedFormPublicId],
    queryFn: () => api.storefront.form(settings.data!.selectedFormPublicId!),
    enabled: !preview && Boolean(settings.data?.selectedFormPublicId),
    retry: false
  });

  useEffect(() => {
    const stream = new EventSource(preview ? '/api/catalog/stream' : '/api/storefront/stream');
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: [preview ? 'storefront-preview-products' : 'storefront-products'] });
      void queryClient.invalidateQueries({ queryKey: [preview ? 'storefront-preview-product' : 'storefront-product'] });
    };
    stream.addEventListener('storefront', refresh);
    stream.addEventListener('catalog', refresh);
    return () => {
      stream.removeEventListener('storefront', refresh);
      stream.removeEventListener('catalog', refresh);
      stream.close();
    };
  }, [preview, queryClient]);

  useEffect(() => {
    setRequestOpen(false);
  }, [slug]);

  function updateSearch(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
    const next = new URLSearchParams(searchParams);
    if (event.target.value) next.set('search', event.target.value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  const items = products.data?.items || [];
  const productData = product.data;
  const canRequestProduct = Boolean(!preview && productData && productData.availability.status !== 'unavailable' && form.data);

  return <main className="storefront-page">
    <header className="storefront-header">
      <Link to={basePath} className="storefront-brand"><span>MT</span><strong>Mobile Trend</strong></Link>
      {preview
        ? <a className="button button--secondary button--small" href="/catalog/products">До каталогу</a>
        : <a className="button button--secondary button--small" href="/login">У робочий простір</a>}
    </header>
    {preview && <div className="storefront-preview-banner">Preview магазину · сторінка закрита від індексації</div>}

    {slug ? productData ? <>
    <StorefrontProductJsonLd product={productData} />
    <section className="storefront-detail">
      <div className="storefront-detail__media">
        <ProductGallery product={productData} />
        <StorefrontDescription product={productData} />
      </div>
      <div className="storefront-detail__main">
      <article className="storefront-detail__info">
        <Link to={basePath} className="storefront-back"><Icon name="arrowLeft" size={16} /> До каталогу</Link>
        <p className="eyebrow">{productData.productCode} · {productData.conditionLabel}</p>
        <h1>{productData.name}</h1>
        <div className="storefront-detail__badges"><span>{productData.availability.label}</span><span>{productData.priceLabel}</span></div>
        {productData.shortDescription && <p>{productData.shortDescription}</p>}
        <dl className="storefront-specs">
          {baseSpecItems(productData).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl>
        <StorefrontModifications product={productData} preview={preview} />
        <button className="button button--primary" type="button" disabled={!canRequestProduct} onClick={() => setRequestOpen(true)}>
          {preview ? 'Preview без заявки' : productData.availability.status === 'unavailable' ? 'Немає в наявності' : form.data ? 'Оформити заявку' : 'Заявка недоступна'} <Icon name="arrowRight" size={16} />
        </button>
      </article>
      <StorefrontCharacteristics product={productData} />
      </div>
    </section>
    {requestOpen && canRequestProduct && <StorefrontApplicationModal product={productData} form={form.data} onClose={() => setRequestOpen(false)} />}
    </> : <section className="storefront-empty"><Icon name="phone" size={32} /><h2>{product.isLoading ? 'Завантаження товару...' : 'Товар не знайдено'}</h2></section> : <section className="storefront-catalog">
      <div className="storefront-hero">
        <p className="eyebrow">Used & refurbished</p>
        <h1>Смартфони з перевіреним станом</h1>
      </div>
      <div className="storefront-controls">
        <label className="field"><span>Пошук</span><input value={search} onChange={updateSearch} placeholder="iPhone, Samsung, код товару" /></label>
        <StyledSelect value={condition} options={conditionOptions} onChange={(value) => setCondition(value as CatalogCondition | 'all')} />
        <StyledSelect value={availability} options={availabilityOptions} onChange={(value) => setAvailability(value as CatalogAvailabilityStatus | 'all')} />
        <StyledSelect value={sort} options={sortOptions} onChange={(value) => setSort(String(value))} />
      </div>
      <div className="storefront-grid">
        {items.map((item) => <Link to={productLink(item, preview)} className="storefront-card" key={item.productCode}>
          <ProductImage product={item} />
          <span>{item.conditionLabel}</span>
          <strong>{item.name}</strong>
          <small>{item.productCode} · {item.availability.label}</small>
          <b>{item.priceLabel}</b>
        </Link>)}
      </div>
      {!products.isLoading && !items.length && <div className="storefront-empty"><Icon name="phone" size={32} /><h2>Товарів не знайдено</h2></div>}
    </section>}
  </main>;
}
