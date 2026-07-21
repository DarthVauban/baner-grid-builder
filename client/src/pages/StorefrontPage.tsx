import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, Navigation, Pagination, Thumbs } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/thumbs';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import type {
  CatalogAvailabilityStatus,
  CatalogCondition,
  CatalogProduct,
  CatalogProductModificationOption,
  CatalogProductModificationParameter,
  CatalogStorefrontCharacteristicFilter,
  CatalogStorefrontFilters
} from '../types/catalog';

type PublicForm = Awaited<ReturnType<typeof api.storefront.form>>;
type PublicField = PublicForm['fields'][number];
type StorefrontGalleryImage = { url: string; alt: string };

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
      ? <img src={product.mainImageUrl} alt={product.name} loading="lazy" draggable={false} onError={() => setFailed(true)} />
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
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!images.length || typeof document === 'undefined') return null;

  return createPortal(<div className="storefront-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Перегляд фото" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <button className="storefront-gallery-lightbox__close" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={24} /></button>
    <Swiper
      className="storefront-gallery-lightbox__swiper"
      modules={[Keyboard, Navigation, Pagination]}
      initialSlide={index}
      keyboard={{ enabled: true }}
      navigation={images.length > 1}
      pagination={images.length > 1 ? { type: 'fraction' } : false}
      onSlideChange={(swiper) => onIndex(swiper.realIndex)}
    >
      {images.map((image, slideIndex) => <SwiperSlide key={`${image.url}-${slideIndex}`}>
        <span className="storefront-gallery-lightbox__image">
          <img src={image.url} alt={image.alt} draggable={false} />
        </span>
      </SwiperSlide>)}
    </Swiper>
  </div>, document.body);
}

function ProductGallery({ product }: { product: CatalogProduct }) {
  const images = useMemo(() => productGalleryImages(product), [product]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperInstance | null>(null);
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);

  useEffect(() => {
    setLightboxIndex(null);
    setThumbsSwiper(null);
  }, [product.productCode]);

  useEffect(() => {
    setBrandLogoFailed(false);
  }, [product.brand?.logoUrl]);

  if (!images.length) return <span className="storefront-product-image storefront-product-image--gallery"><Icon name="phone" size={34} /></span>;

  return <div className="storefront-gallery">
    <div className="storefront-gallery__stage-shell">
      <Swiper
        className="storefront-gallery__stage-swiper"
        modules={[Keyboard, Navigation, Pagination, Thumbs]}
        keyboard={{ enabled: true }}
        navigation={images.length > 1}
        pagination={images.length > 1 ? { type: 'fraction' } : false}
        thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
      >
        {images.map((image, index) => <SwiperSlide key={`${image.url}-${index}`}>
          <button className="storefront-gallery__stage" type="button" onClick={() => setLightboxIndex(index)} aria-label="Відкрити фото на весь екран">
            <img src={image.url} alt={image.alt} loading="lazy" draggable={false} />
          </button>
        </SwiperSlide>)}
      </Swiper>
      {product.brand?.logoUrl && !brandLogoFailed && <span className="storefront-gallery__brand-sticker">
        <img src={product.brand.logoUrl} alt={product.brand.label} loading="lazy" draggable={false} onError={() => setBrandLogoFailed(true)} />
      </span>}
    </div>
    {images.length > 1 && <Swiper
      className="storefront-gallery__thumbs"
      modules={[Thumbs]}
      slidesPerView="auto"
      spaceBetween={8}
      watchSlidesProgress
      onSwiper={setThumbsSwiper}
      aria-label="Фото товару"
    >
      {images.map((image, index) => <SwiperSlide className="storefront-gallery__thumb-slide" key={`${image.url}-${index}`}>
        <button type="button" aria-label={`Фото ${index + 1}`}>
          <img src={image.url} alt="" loading="lazy" draggable={false} />
        </button>
      </SwiperSlide>)}
    </Swiper>}
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
  return <dl className="storefront-characteristics">
    {items.map((item) => <div key={item.key}>
      <dt>{item.label}</dt>
      <dd>{item.displayValue}</dd>
    </div>)}
  </dl>;
}

function StorefrontProductInformation({ product }: { product: CatalogProduct }) {
  const hasDescription = Boolean(product.descriptionHtml);
  const hasCharacteristics = Boolean(product.characteristics?.items?.length);
  if (!hasDescription && !hasCharacteristics) return null;

  return <section className="storefront-product-content" aria-label="Інформація про товар">
    {hasDescription && <div className="storefront-product-content__section storefront-product-content__section--description">
      <header className="storefront-product-content__header">
        <span>Про товар</span>
        <h2>Опис товару</h2>
      </header>
      <StorefrontDescription product={product} />
    </div>}
    {hasCharacteristics && <div className="storefront-product-content__section storefront-product-content__section--characteristics">
      <header className="storefront-product-content__header">
        <span>Детальні дані</span>
        <h2>Характеристики</h2>
      </header>
      <StorefrontCharacteristics product={product} />
    </div>}
  </section>;
}

function isColorModification(parameter: Pick<CatalogProductModificationParameter, 'key' | 'label'>) {
  const marker = `${parameter.key} ${parameter.label}`.toLocaleLowerCase('uk-UA');
  return ['color', 'colour', 'kolir', '\u043a\u043e\u043b\u0456\u0440', '\u0446\u0432\u0435\u0442'].some((value) => marker.includes(value));
}

function modificationOptionContent(parameter: CatalogProductModificationParameter, option: CatalogProductModificationOption) {
  if (!isColorModification(parameter)) return option.label;
  return <>
    <span className="storefront-modification__thumb" aria-hidden="true">
      {option.product?.mainImageUrl
        ? <img src={option.product.mainImageUrl} alt="" loading="lazy" />
        : <Icon name="phone" size={20} />}
    </span>
    <span className="storefront-modification__thumb-label">{option.label}</span>
  </>;
}

function StorefrontModifications({ product, preview }: { product: CatalogProduct; preview: boolean }) {
  const parameters = (product.modifications?.parameters || []).filter((parameter) => parameter.options.length);
  if (!parameters.length) return null;
  return <div className="storefront-modifications" aria-label="Модифікації товару">
    {parameters.map((parameter) => {
      const colorParameter = isColorModification(parameter);
      return <div className="storefront-modification" key={parameter.id}>
        <span className="storefront-modification__label">{parameter.label}</span>
        <div className={`storefront-modification__options${colorParameter ? ' storefront-modification__options--swatches' : ''}`}>
          {parameter.options.map((option) => {
            const className = `storefront-modification__option${colorParameter ? ' storefront-modification__option--swatch' : ''}${option.selected ? ' storefront-modification__option--active' : ''}${option.compatible === false && !option.selected ? ' storefront-modification__option--unavailable' : ''}${option.product ? '' : ' storefront-modification__option--disabled'}`;
            if (option.selected) {
              return <button className={className} type="button" disabled key={option.id}>{modificationOptionContent(parameter, option)}</button>;
            }
            if (option.product) {
              return <Link className={className} to={productLink(option.product, preview)} key={option.id}>{modificationOptionContent(parameter, option)}</Link>;
            }
            return <span className={className} key={option.id}>{modificationOptionContent(parameter, option)}</span>;
          })}
        </div>
      </div>;
    })}
  </div>;
}

export function StorefrontProductDetailPage({
  product,
  preview,
  basePath,
  canRequestProduct,
  onRequest
}: {
  product: CatalogProduct;
  preview: boolean;
  basePath: string;
  canRequestProduct: boolean;
  onRequest: () => void;
}) {
  const specs = baseSpecItems(product);
  const actionLabel = preview
    ? 'Preview без заявки'
    : product.availability.status === 'unavailable'
      ? 'Немає в наявності'
      : canRequestProduct
        ? 'Оформити заявку'
        : 'Заявка недоступна';

  return <section className="storefront-product-view" data-product-detail="rebuilt">
    <div className="storefront-product-view__hero">
      <section className="storefront-product-view__media" aria-label="Фото товару">
        <ProductGallery product={product} />
      </section>
      <article className="storefront-product-view__details">
        <Link to={basePath} className="storefront-back"><Icon name="arrowLeft" size={16} /> До каталогу</Link>
        <div className="storefront-product-view__body">
          <div className="storefront-product-view__meta">
            <span>{product.productCode}</span>
            <span>{product.conditionLabel}</span>
            {product.brand?.label && <span>{product.brand.label}</span>}
          </div>
          <h1>{product.name}</h1>
          <div className="storefront-product-view__purchase">
            <strong>{product.priceLabel}</strong>
            <span>{product.availability.label}</span>
          </div>
          {product.shortDescription && <p className="storefront-product-view__lead">{product.shortDescription}</p>}
          {specs.length > 0 && <dl className="storefront-product-view__specs">
            {specs.map((item) => <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>)}
          </dl>}
          <StorefrontModifications product={product} preview={preview} />
        </div>
        <div className="storefront-product-view__footer">
          <button className="button button--primary storefront-product-view__action" type="button" disabled={!canRequestProduct} onClick={onRequest}>
            {actionLabel} <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </article>
    </div>
    <StorefrontProductInformation product={product} />
  </section>;
}

const swatchColors = [
  ['black', '#050505'], ['чор', '#050505'],
  ['graphite', '#2f3338'], ['графіт', '#2f3338'],
  ['grey', '#bfc2c7'], ['gray', '#bfc2c7'], ['silver', '#d7d9dc'], ['сір', '#bfc2c7'], ['сріб', '#d7d9dc'],
  ['white', '#ffffff'], ['бі', '#ffffff'],
  ['blue', '#38a9d6'], ['син', '#2563eb'], ['блакит', '#38a9d6'],
  ['green', '#35b779'], ['зелен', '#35b779'],
  ['red', '#e53935'], ['черв', '#e53935'],
  ['purple', '#8b5cf6'], ['violet', '#8b5cf6'], ['фіолет', '#8b5cf6'],
  ['yellow', '#facc15'], ['жовт', '#facc15'],
  ['gold', '#d8b45f'], ['золот', '#d8b45f'],
  ['pink', '#f4a7c8'], ['рож', '#f4a7c8']
] as const;

function swatchColor(label: string, colorHex = '') {
  if (/^#[0-9a-f]{6}$/i.test(colorHex)) return colorHex;
  const normalized = label.toLocaleLowerCase('uk-UA');
  const match = swatchColors.find(([token]) => normalized.includes(token));
  return match?.[1] || '#f8fafc';
}

function swatchStyle(label: string, colorHex = ''): CSSProperties {
  return { background: swatchColor(label, colorHex) };
}

function StorefrontCardModificationOption({
  parameter,
  option,
  busy,
  onSelect
}: {
  parameter: CatalogProductModificationParameter;
  option: CatalogProductModificationOption;
  busy: boolean;
  onSelect: (parameter: CatalogProductModificationParameter, option: CatalogProductModificationOption) => void;
}) {
  const colorParameter = isColorModification(parameter);
  const className = `storefront-card-modification__option${colorParameter ? ' storefront-card-modification__option--swatch' : ''}${option.selected ? ' storefront-card-modification__option--active' : ''}${option.compatible === false && !option.selected ? ' storefront-card-modification__option--unavailable' : ''}`;
  const content = colorParameter
    ? <><span className="storefront-card-modification__swatch" style={swatchStyle(option.label)} aria-hidden="true" /><span className="visually-hidden">{option.label}</span></>
    : option.label;
  return <button
    className={className}
    type="button"
    title={option.label}
    aria-pressed={option.selected}
    disabled={busy || option.selected || !option.product}
    onClick={() => onSelect(parameter, option)}
  >
    {content}
  </button>;
}

function optimisticCardVariant(
  current: CatalogProduct,
  parameter: CatalogProductModificationParameter,
  option: CatalogProductModificationOption
) {
  if (!option.product) return current;
  return {
    ...current,
    ...option.product,
    modifications: current.modifications ? {
      ...current.modifications,
      parameters: current.modifications.parameters.map((item) => item.id === parameter.id ? {
        ...item,
        currentValueId: option.id,
        currentValueLabel: option.label,
        options: item.options.map((candidate) => ({ ...candidate, selected: candidate.id === option.id }))
      } : item)
    } : current.modifications
  };
}

export function StorefrontProductCard({
  product,
  preview,
  formAvailable,
  onRequest
}: {
  product: CatalogProduct;
  preview: boolean;
  formAvailable: boolean;
  onRequest: (product: CatalogProduct) => void;
}) {
  const queryClient = useQueryClient();
  const requestId = useRef(0);
  const [displayedProduct, setDisplayedProduct] = useState(product);
  const [variantBusy, setVariantBusy] = useState(false);
  const [variantError, setVariantError] = useState('');

  useEffect(() => {
    setDisplayedProduct((current) => current.productCode === product.productCode ? product : current);
  }, [product]);

  const parameters = (displayedProduct.modifications?.parameters || []).filter((parameter) => parameter.options.length);
  const link = productLink(displayedProduct, preview);
  const canBuy = !preview && formAvailable && displayedProduct.availability.status !== 'unavailable' && !variantBusy;

  async function selectVariant(parameter: CatalogProductModificationParameter, option: CatalogProductModificationOption) {
    if (!option.product || option.selected || variantBusy) return;
    const currentRequest = ++requestId.current;
    const previousProduct = displayedProduct;
    setVariantError('');
    setVariantBusy(true);
    setDisplayedProduct(optimisticCardVariant(previousProduct, parameter, option));

    try {
      const variant = await queryClient.fetchQuery({
        queryKey: [preview ? 'storefront-preview-product' : 'storefront-product', option.product.slug],
        queryFn: () => preview ? api.storefront.previewGet(option.product!.slug) : api.storefront.get(option.product!.slug)
      });
      if (requestId.current === currentRequest) setDisplayedProduct(variant);
    } catch {
      if (requestId.current === currentRequest) {
        setDisplayedProduct(previousProduct);
        setVariantError('Не вдалося завантажити цю модифікацію.');
      }
    } finally {
      if (requestId.current === currentRequest) setVariantBusy(false);
    }
  }

  return <article className="storefront-card" aria-busy={variantBusy}>
    <Link to={link} className="storefront-card__body">
      <ProductImage product={displayedProduct} />
      <span className="storefront-card__badge">{displayedProduct.conditionLabel}</span>
      <span className="storefront-card__brand">{displayedProduct.brand?.label || ''}</span>
      <strong>{displayedProduct.name}</strong>
      <small>{displayedProduct.productCode} · {displayedProduct.availability.label}</small>
    </Link>
    <div className="storefront-card__purchase">
      <b>{displayedProduct.priceLabel}</b>
      <button className="storefront-card__buy" type="button" disabled={!canBuy} onClick={() => onRequest(displayedProduct)}>Купити</button>
    </div>
    <div className="storefront-card__hover">
      <span className="storefront-card__availability">{displayedProduct.availability.label}</span>
      {parameters.map((parameter) => <div className="storefront-card-modification" key={parameter.id}>
        <span className="storefront-card-modification__label">{parameter.label}</span>
        <div className={`storefront-card-modification__options${isColorModification(parameter) ? ' storefront-card-modification__options--swatches' : ''}`}>
          {parameter.options.map((option) => <StorefrontCardModificationOption parameter={parameter} option={option} busy={variantBusy} onSelect={(item, candidate) => void selectVariant(item, candidate)} key={option.id} />)}
        </div>
      </div>)}
      {variantError && <span className="storefront-card__variant-error" role="alert">{variantError}</span>}
    </div>
  </article>;
}

function activeFilterValues(filters: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(filters).map(([key, values]) => [
    key,
    values.filter(Boolean)
  ]).filter(([, values]) => values.length));
}

function StorefrontFilterPanel({
  filters,
  brandId,
  setBrandId,
  priceDraft,
  setPriceDraft,
  priceFilter,
  applyPriceFilter,
  resetFilters,
  characteristicFilters,
  toggleCharacteristic
}: {
  filters: CatalogStorefrontFilters | undefined;
  brandId: string;
  setBrandId: (value: string) => void;
  priceDraft: { min: string; max: string };
  setPriceDraft: (value: { min: string; max: string }) => void;
  priceFilter: { min: string; max: string };
  applyPriceFilter: () => void;
  resetFilters: () => void;
  characteristicFilters: Record<string, string[]>;
  toggleCharacteristic: (key: string, value: string) => void;
}) {
  const priceMin = Math.floor(filters?.price.min || 0);
  const priceMax = Math.ceil(filters?.price.max || 0);
  const safeMax = Math.max(priceMax, priceMin + 1);
  const draftMin = priceDraft.min || String(priceMin);
  const draftMax = priceDraft.max || String(priceMax || safeMax);
  const hasActiveFilters = brandId !== 'all' || Boolean(priceFilter.min || priceFilter.max) || Object.keys(activeFilterValues(characteristicFilters)).length > 0;
  return <aside className="storefront-filter-panel">
    <header>
      <h2>Фільтри</h2>
      {hasActiveFilters && <button type="button" onClick={resetFilters}>Скинути</button>}
    </header>
    <section className="storefront-filter-group">
      <h3>Бренд</h3>
      <label className="storefront-filter-option">
        <input type="radio" name="storefront-brand" checked={brandId === 'all'} onChange={() => setBrandId('all')} />
        <span>Усі бренди</span>
      </label>
      {(filters?.brands || []).map((option) => <label className="storefront-filter-option" key={option.value}>
        <input type="radio" name="storefront-brand" checked={brandId === option.value} onChange={() => setBrandId(option.value)} />
        <span>{option.label}</span>
        <small>{option.count}</small>
      </label>)}
    </section>
    <section className="storefront-filter-group storefront-filter-group--price">
      <h3>Ціна, грн</h3>
      <div className="storefront-price-filter__inputs">
        <input type="number" min={priceMin} value={priceDraft.min} placeholder={String(priceMin)} onChange={(event) => setPriceDraft({ ...priceDraft, min: event.target.value })} />
        <span />
        <input type="number" min={priceMin} value={priceDraft.max} placeholder={String(priceMax)} onChange={(event) => setPriceDraft({ ...priceDraft, max: event.target.value })} />
        <button type="button" onClick={applyPriceFilter}>OK</button>
      </div>
      <div className="storefront-price-filter__range">
        <input type="range" min={priceMin} max={safeMax} value={Math.min(Number(draftMin) || priceMin, safeMax)} onChange={(event) => setPriceDraft({ ...priceDraft, min: event.target.value })} />
        <input type="range" min={priceMin} max={safeMax} value={Math.min(Number(draftMax) || safeMax, safeMax)} onChange={(event) => setPriceDraft({ ...priceDraft, max: event.target.value })} />
      </div>
    </section>
    {(filters?.characteristics || []).map((filter: CatalogStorefrontCharacteristicFilter) => <section className="storefront-filter-group" key={filter.key}>
      <h3>{filter.label}</h3>
      {filter.options.map((option) => {
        const selected = (characteristicFilters[filter.key] || []).includes(option.value);
        return <label className="storefront-filter-option" key={option.value}>
          <input type="checkbox" checked={selected} onChange={() => toggleCharacteristic(filter.key, option.value)} />
          {filter.type === 'color' && <span className="storefront-filter-option__swatch" style={swatchStyle(option.label, option.colorHex)} aria-hidden="true" />}
          <span>{option.label}</span>
          <small>{option.count}</small>
        </label>;
      })}
    </section>)}
  </aside>;
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
  const [brandId, setBrandId] = useState(searchParams.get('brandId') || 'all');
  const [priceDraft, setPriceDraft] = useState({ min: '', max: '' });
  const [priceFilter, setPriceFilter] = useState({ min: '', max: '' });
  const [characteristicFilters, setCharacteristicFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('updated_desc');
  const [requestProduct, setRequestProduct] = useState<CatalogProduct | null>(null);
  const serializedCharacteristicFilters = useMemo(() => {
    const active = activeFilterValues(characteristicFilters);
    return Object.keys(active).length ? JSON.stringify(active) : '';
  }, [characteristicFilters]);
  const params = useMemo(() => ({
    search,
    brandId: brandId === 'all' ? undefined : brandId,
    priceMin: priceFilter.min || undefined,
    priceMax: priceFilter.max || undefined,
    characteristics: serializedCharacteristicFilters || undefined,
    sort,
    page: 1,
    pageSize: 24
  }), [brandId, priceFilter.max, priceFilter.min, search, serializedCharacteristicFilters, sort]);
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
    setRequestProduct(null);
  }, [slug]);

  function updateSearch(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
    const next = new URLSearchParams(searchParams);
    if (event.target.value) next.set('search', event.target.value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  function applyPriceFilter() {
    const min = Number(priceDraft.min);
    const max = Number(priceDraft.max);
    const nextMin = Number.isFinite(min) && min >= 0 ? Math.round(min) : '';
    const nextMax = Number.isFinite(max) && max >= 0 ? Math.round(max) : '';
    if (nextMin !== '' && nextMax !== '' && nextMin > nextMax) {
      setPriceFilter({ min: String(nextMax), max: String(nextMin) });
      setPriceDraft({ min: String(nextMax), max: String(nextMin) });
      return;
    }
    setPriceFilter({
      min: nextMin === '' ? '' : String(nextMin),
      max: nextMax === '' ? '' : String(nextMax)
    });
  }

  function resetFilters() {
    setBrandId('all');
    setPriceDraft({ min: '', max: '' });
    setPriceFilter({ min: '', max: '' });
    setCharacteristicFilters({});
  }

  function toggleCharacteristic(key: string, value: string) {
    setCharacteristicFilters((current) => {
      const values = current[key] || [];
      const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      const next = { ...current };
      if (nextValues.length) next[key] = nextValues;
      else delete next[key];
      return next;
    });
  }

  const items = products.data?.items || [];
  const storefrontFilters = products.data?.filters;
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
    <StorefrontProductDetailPage
      product={productData}
      preview={preview}
      basePath={basePath}
      canRequestProduct={canRequestProduct}
      onRequest={() => setRequestProduct(productData)}
    />
    </> : <section className="storefront-empty"><Icon name="phone" size={32} /><h2>{product.isLoading ? 'Завантаження товару...' : 'Товар не знайдено'}</h2></section> : <section className="storefront-catalog">
      <div className="storefront-hero">
        <p className="eyebrow">Used & refurbished</p>
        <h1>Смартфони з перевіреним станом</h1>
      </div>
      <div className="storefront-controls">
        <label className="field"><span>Пошук</span><input value={search} onChange={updateSearch} placeholder="iPhone, Samsung, код товару" /></label>
        <StyledSelect value={sort} options={sortOptions} onChange={(value) => setSort(String(value))} />
      </div>
      <div className="storefront-catalog__layout">
        <StorefrontFilterPanel
          filters={storefrontFilters}
          brandId={brandId}
          setBrandId={setBrandId}
          priceDraft={priceDraft}
          setPriceDraft={setPriceDraft}
          priceFilter={priceFilter}
          applyPriceFilter={applyPriceFilter}
          resetFilters={resetFilters}
          characteristicFilters={characteristicFilters}
          toggleCharacteristic={toggleCharacteristic}
        />
        <div className="storefront-grid">
          {items.map((item) => <StorefrontProductCard
            product={item}
            preview={preview}
            formAvailable={Boolean(form.data)}
            onRequest={setRequestProduct}
            key={item.productCode}
          />)}
        </div>
      </div>
      {!products.isLoading && !items.length && <div className="storefront-empty"><Icon name="phone" size={32} /><h2>Товарів не знайдено</h2></div>}
    </section>}
    {requestProduct && !preview && form.data && requestProduct.availability.status !== 'unavailable' && <StorefrontApplicationModal product={requestProduct} form={form.data} onClose={() => setRequestProduct(null)} />}
  </main>;
}
