import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import 'swiper/css/pagination';
import { AutoHeightSandbox } from '../components/AutoHeightSandbox';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import {
  defaultProductCardTheme,
  defaultProductPageTheme,
  defaultStorefrontTheme,
  productCardThemeStyle,
  productPageThemeStyle,
  storefrontThemeStyle
} from '../lib/storefront-theme';
import type {
  CatalogAvailabilityStatus,
  CatalogCondition,
  CatalogProduct,
  CatalogProductCardContentKey,
  CatalogProductCardTheme,
  CatalogProductPageTheme,
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

function storefrontBrandHref(value: string, fallback: string) {
  const candidate = value.trim();
  if (!candidate) return fallback;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

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
  const swiperRef = useRef<SwiperInstance | null>(null);
  const thumbsSwiperRef = useRef<SwiperInstance | null>(null);

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

  useEffect(() => {
    if (!thumbsSwiperRef.current || thumbsSwiperRef.current.destroyed) return;
    thumbsSwiperRef.current.slideTo(index);
  }, [index]);

  if (!images.length || typeof document === 'undefined') return null;

  return createPortal(<div className="storefront-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Перегляд фото" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <button className="storefront-gallery-lightbox__close" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={24} /></button>
    <Swiper
      className="storefront-gallery-lightbox__swiper"
      modules={[Keyboard, Pagination]}
      initialSlide={index}
      keyboard={{ enabled: true }}
      pagination={images.length > 1 ? { type: 'fraction' } : false}
      onSwiper={(swiper) => { swiperRef.current = swiper; }}
      onSlideChange={(swiper) => onIndex(swiper.realIndex)}
    >
      {images.map((image, slideIndex) => <SwiperSlide key={`${image.url}-${slideIndex}`}>
        <span className="storefront-gallery-lightbox__image">
          <img src={image.url} alt={image.alt} draggable={false} />
        </span>
      </SwiperSlide>)}
    </Swiper>
    {images.length > 1 && <div className="storefront-gallery-lightbox__thumbs-shell">
      <Swiper
        className="storefront-gallery-lightbox__thumbs"
        slidesPerView="auto"
        spaceBetween={8}
        watchSlidesProgress
        centerInsufficientSlides
        onSwiper={(swiper) => {
          thumbsSwiperRef.current = swiper;
          swiper.slideTo(index, 0);
        }}
        aria-label="Мініатюри фото"
      >
        {images.map((image, thumbIndex) => <SwiperSlide className="storefront-gallery-lightbox__thumb-slide" key={`${image.url}-lightbox-thumb-${thumbIndex}`}>
          <button
            className={index === thumbIndex ? 'storefront-gallery-lightbox__thumb-button storefront-gallery-lightbox__thumb-button--active' : 'storefront-gallery-lightbox__thumb-button'}
            type="button"
            onClick={() => {
              swiperRef.current?.slideTo(thumbIndex);
              onIndex(thumbIndex);
            }}
            aria-label={`Фото ${thumbIndex + 1}`}
            aria-current={index === thumbIndex ? 'true' : undefined}
          >
            <img src={image.url} alt="" loading="lazy" draggable={false} />
          </button>
        </SwiperSlide>)}
      </Swiper>
    </div>}
    {images.length > 1 && <>
      <button
        className="storefront-gallery-navigation storefront-gallery-lightbox__navigation storefront-gallery-lightbox__navigation--prev"
        type="button"
        onClick={() => swiperRef.current?.slidePrev()}
        disabled={index === 0}
        aria-label="Попереднє фото"
      >
        <Icon name="chevronLeft" size={30} />
      </button>
      <button
        className="storefront-gallery-navigation storefront-gallery-lightbox__navigation storefront-gallery-lightbox__navigation--next"
        type="button"
        onClick={() => swiperRef.current?.slideNext()}
        disabled={index === images.length - 1}
        aria-label="Наступне фото"
      >
        <Icon name="chevronRight" size={30} />
      </button>
    </>}
  </div>, document.body);
}

function ProductGallery({ product, theme = defaultProductPageTheme }: { product: CatalogProduct; theme?: CatalogProductPageTheme }) {
  const images = useMemo(() => productGalleryImages(product), [product]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const stageSwiperRef = useRef<SwiperInstance | null>(null);
  const thumbsSwiperRef = useRef<SwiperInstance | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);

  useEffect(() => {
    setLightboxIndex(null);
    setActiveIndex(0);
  }, [product.productCode]);

  useEffect(() => {
    setBrandLogoFailed(false);
  }, [product.brand?.logoUrl]);

  useEffect(() => {
    if (!thumbsSwiperRef.current || thumbsSwiperRef.current.destroyed) return;
    thumbsSwiperRef.current.slideTo(activeIndex);
  }, [activeIndex]);

  if (!images.length) return <span className="storefront-product-image storefront-product-image--gallery"><Icon name="phone" size={34} /></span>;

  return <div className="storefront-gallery">
    <div className="storefront-gallery__stage-shell">
      <Swiper
        key={`stage-${product.productCode}`}
        className="storefront-gallery__stage-swiper"
        modules={[Keyboard, Pagination]}
        keyboard={{ enabled: true }}
        pagination={images.length > 1 ? { type: 'fraction' } : false}
        onSwiper={(swiper) => { stageSwiperRef.current = swiper; }}
        onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
      >
        {images.map((image, index) => <SwiperSlide key={`${image.url}-${index}`}>
          <button className="storefront-gallery__stage" type="button" onClick={() => setLightboxIndex(index)} aria-label="Відкрити фото на весь екран">
            <img src={image.url} alt={image.alt} loading="lazy" draggable={false} />
          </button>
        </SwiperSlide>)}
      </Swiper>
      {images.length > 1 && <>
        <button
          className="storefront-gallery-navigation storefront-gallery__navigation storefront-gallery__navigation--prev"
          type="button"
          onClick={() => stageSwiperRef.current?.slidePrev()}
          disabled={activeIndex === 0}
          aria-label="Попереднє фото"
        >
          <Icon name="chevronLeft" size={28} />
        </button>
        <button
          className="storefront-gallery-navigation storefront-gallery__navigation storefront-gallery__navigation--next"
          type="button"
          onClick={() => stageSwiperRef.current?.slideNext()}
          disabled={activeIndex === images.length - 1}
          aria-label="Наступне фото"
        >
          <Icon name="chevronRight" size={28} />
        </button>
      </>}
      {product.brand?.logoUrl && !brandLogoFailed && <span className="storefront-gallery__brand-sticker">
        <img src={product.brand.logoUrl} alt={product.brand.label} loading="lazy" draggable={false} onError={() => setBrandLogoFailed(true)} />
      </span>}
    </div>
    {images.length > 1 && <Swiper
      key={`thumbs-${product.productCode}`}
      className="storefront-gallery__thumbs"
      slidesPerView="auto"
      spaceBetween={theme.gallery.thumbnailGap}
      watchSlidesProgress
      onSwiper={(swiper) => { thumbsSwiperRef.current = swiper; }}
      aria-label="Фото товару"
    >
      {images.map((image, index) => <SwiperSlide className="storefront-gallery__thumb-slide" key={`${image.url}-${index}`}>
        <button
          className={activeIndex === index ? 'storefront-gallery__thumb-button storefront-gallery__thumb-button--active' : 'storefront-gallery__thumb-button'}
          type="button"
          onClick={() => {
            stageSwiperRef.current?.slideTo(index);
            setActiveIndex(index);
          }}
          aria-label={`Фото ${index + 1}`}
          aria-current={activeIndex === index ? 'true' : undefined}
        >
          <img src={image.url} alt="" loading="lazy" draggable={false} />
        </button>
      </SwiperSlide>)}
    </Swiper>}
    {lightboxIndex !== null && <StorefrontGalleryLightbox
      images={images}
      index={lightboxIndex}
      onIndex={(index) => {
        setLightboxIndex(index);
        setActiveIndex(index);
        stageSwiperRef.current?.slideTo(index);
      }}
      onClose={() => setLightboxIndex(null)}
    />}
  </div>;
}

function productPath(slug: string, basePath: string) {
  const encodedSlug = encodeURIComponent(slug);
  return `${basePath.replace(/\/$/, '')}/smartphones/${encodedSlug}`;
}

function productLink(product: Pick<CatalogProduct, 'slug'>, basePath: string) {
  return productPath(product.slug, basePath);
}

function StorefrontDescription({ product }: { product: CatalogProduct }) {
  const html = product.descriptionHtml || '';
  if (!html) return null;
  const css = product.descriptionCss || '';
  const js = product.descriptionJs || '';
  if (css || js || product.descriptionHasJs) {
    const safeCss = css.replace(/<\/style/gi, '<\\/style');
    const safeJs = js.replace(/<\/script/gi, '<\\/script');
    const storefrontFont = 'Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const baseCss = `html{width:100%;max-width:100%;height:auto;overflow:hidden}body{width:auto;max-width:100%;height:auto;min-height:0;margin:0;padding:20px;font:15px/1.65 ${storefrontFont};color:#111827;background:#fff;overflow:hidden}*,*::before,*::after{box-sizing:border-box;min-width:0}img,video,canvas,svg,object,embed{max-width:100%;height:auto}table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse}td,th{overflow-wrap:anywhere;border:1px solid #e5e7eb;padding:8px}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#0f766e}`;
    const guardCss = `html,html body.storefront-description-document{width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;overflow:hidden!important}html body.storefront-description-document,html body.storefront-description-document *,html body.storefront-description-document *::before,html body.storefront-description-document *::after{font-family:${storefrontFont}!important}html body.storefront-description-document *{max-width:100%!important;min-width:0!important;overflow-wrap:anywhere}html body.storefront-description-document>*,html body.storefront-description-document img,html body.storefront-description-document video,html body.storefront-description-document canvas,html body.storefront-description-document svg,html body.storefront-description-document object,html body.storefront-description-document embed{max-width:100%!important}html body.storefront-description-document img,html body.storefront-description-document video,html body.storefront-description-document canvas,html body.storefront-description-document svg{height:auto!important}`;
    const srcDoc = `<!doctype html><html lang="uk"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style data-storefront-description-base>${baseCss}</style><style data-product-description>${safeCss}</style><style data-storefront-description-guard>${guardCss}</style></head><body class="storefront-description-document">${html}<script>${safeJs}</script></body></html>`;
    return <section className="storefront-description storefront-description--sandbox">
      <AutoHeightSandbox title="Опис товару" srcDoc={srcDoc} />
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

function StorefrontProductInformation({ product, theme = defaultProductPageTheme }: { product: CatalogProduct; theme?: CatalogProductPageTheme }) {
  const hasDescription = Boolean(product.descriptionHtml);
  const hasCharacteristics = Boolean(product.characteristics?.items?.length);
  const [activeTab, setActiveTab] = useState<'description' | 'characteristics'>(() => (
    hasDescription ? 'description' : 'characteristics'
  ));

  useEffect(() => {
    if (activeTab === 'description' && !hasDescription && hasCharacteristics) setActiveTab('characteristics');
    if (activeTab === 'characteristics' && !hasCharacteristics && hasDescription) setActiveTab('description');
  }, [activeTab, hasCharacteristics, hasDescription]);

  if (!hasDescription && !hasCharacteristics) return null;

  const tabs = [
    ...(hasDescription ? [{ id: 'description' as const, label: theme.tabs.descriptionLabel }] : []),
    ...(hasCharacteristics ? [{ id: 'characteristics' as const, label: theme.tabs.characteristicsLabel }] : [])
  ];
  const resolvedActiveTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const tabPrefix = `storefront-product-information-${product.id}`;

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, tabId: 'description' | 'characteristics') {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    window.requestAnimationFrame(() => document.getElementById(`${tabPrefix}-tab-${nextTab.id}`)?.focus());
  }

  return <section className="storefront-product-content" aria-label="Інформація про товар">
    {tabs.length > 1 && <div className="storefront-product-content__tabs" role="tablist" aria-label="Інформація про товар">
      {tabs.map((tab) => <button
        className={`storefront-product-content__tab${resolvedActiveTab === tab.id ? ' active' : ''}`}
        id={`${tabPrefix}-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={resolvedActiveTab === tab.id}
        aria-controls={`${tabPrefix}-panel-${tab.id}`}
        tabIndex={resolvedActiveTab === tab.id ? 0 : -1}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
        key={tab.id}
      >
        {tab.label}
      </button>)}
    </div>}
    <div
      className={`storefront-product-content__section storefront-product-content__section--${resolvedActiveTab}`}
      id={`${tabPrefix}-panel-${resolvedActiveTab}`}
      role={tabs.length > 1 ? 'tabpanel' : undefined}
      aria-labelledby={tabs.length > 1 ? `${tabPrefix}-tab-${resolvedActiveTab}` : undefined}
    >
      <header className="storefront-product-content__header">
        <span>{resolvedActiveTab === 'description' ? 'Про товар' : 'Детальні дані'}</span>
        <h2>{resolvedActiveTab === 'description' ? theme.tabs.descriptionLabel : theme.tabs.characteristicsLabel}</h2>
      </header>
      {resolvedActiveTab === 'description'
        ? <StorefrontDescription product={product} />
        : <StorefrontCharacteristics product={product} />}
    </div>
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

function StorefrontModifications({ product, basePath }: { product: CatalogProduct; basePath: string }) {
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
              return <Link className={className} to={productLink(option.product, basePath)} key={option.id}>{modificationOptionContent(parameter, option)}</Link>;
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
  onRequest,
  theme = defaultProductPageTheme
}: {
  product: CatalogProduct;
  preview: boolean;
  basePath: string;
  canRequestProduct: boolean;
  onRequest: () => void;
  theme?: CatalogProductPageTheme;
}) {
  const specs = baseSpecItems(product);
  const actionLabel = product.availability.status === 'unavailable'
    ? theme.button.unavailableLabel
    : canRequestProduct
      ? theme.button.label
      : preview
        ? theme.button.previewLabel
        : 'Заявка недоступна';

  return <section className="storefront-product-view" data-product-detail="rebuilt">
    <div className="storefront-product-view__hero">
      <section className="storefront-product-view__media" aria-label="Фото товару">
        <ProductGallery product={product} theme={theme} />
      </section>
      <article className="storefront-product-view__details">
        {theme.visibility.backLink && <Link to={basePath} className="storefront-back"><Icon name="arrowLeft" size={16} /> До каталогу</Link>}
        <div className="storefront-product-view__body">
          {theme.visibility.meta && <div className="storefront-product-view__meta">
            <span>{product.productCode}</span>
            <span>{product.conditionLabel}</span>
            {product.brand?.label && <span>{product.brand.label}</span>}
          </div>}
          <h1>{product.name}</h1>
          <div className="storefront-product-view__purchase">
            <strong>{product.priceLabel}</strong>
            <span>{product.availability.label}</span>
          </div>
          {theme.visibility.shortDescription && product.shortDescription && <p className="storefront-product-view__lead">{product.shortDescription}</p>}
          {theme.visibility.quickSpecs && specs.length > 0 && <dl className="storefront-product-view__specs">
            {specs.map((item) => <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>)}
          </dl>}
          {theme.visibility.modifications && <StorefrontModifications product={product} basePath={basePath} />}
        </div>
        <div className="storefront-product-view__footer">
          <button className="button button--primary storefront-product-view__action" type="button" disabled={!canRequestProduct} onClick={onRequest}>
            {actionLabel} <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </article>
    </div>
    {theme.visibility.tabs && <StorefrontProductInformation product={product} theme={theme} />}
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
  basePath = '/storefront',
  formAvailable,
  onRequest,
  theme = defaultProductCardTheme
}: {
  product: CatalogProduct;
  preview: boolean;
  basePath?: string;
  formAvailable: boolean;
  onRequest: (product: CatalogProduct) => void;
  theme?: CatalogProductCardTheme;
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
  const link = productLink(displayedProduct, basePath);
  const canBuy = formAvailable && displayedProduct.availability.status !== 'unavailable' && !variantBusy;
  const content: Record<CatalogProductCardContentKey, ReactNode> = {
    image: <ProductImage product={displayedProduct} />,
    badge: <span className="storefront-card__badge">{displayedProduct.conditionLabel}</span>,
    brand: <span className="storefront-card__brand">{displayedProduct.brand?.label || ''}</span>,
    title: <strong>{displayedProduct.name}</strong>,
    meta: <small>{displayedProduct.productCode} · {displayedProduct.availability.label}</small>
  };

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

  const modificationsMode = theme.visibility.modifications ? theme.modifications.mode : 'hidden';
  const buttonLabel = displayedProduct.availability.status === 'unavailable' ? theme.button.unavailableLabel : theme.button.label;

  return <article className={`storefront-card storefront-card--modifications-${modificationsMode}`} aria-busy={variantBusy}>
    <Link to={link} className="storefront-card__body">
      {theme.contentOrder.map((key) => theme.visibility[key] ? <span className="storefront-card__part" key={key}>{content[key]}</span> : null)}
    </Link>
    {(theme.visibility.price || theme.visibility.button) && <div className={`storefront-card__purchase${theme.button.fullWidth ? ' storefront-card__purchase--stacked' : ''}`}>
      {theme.visibility.price && <b>{displayedProduct.priceLabel}</b>}
      {theme.visibility.button && <button className="storefront-card__buy" type="button" disabled={!canBuy} onClick={() => onRequest(displayedProduct)}>{buttonLabel}</button>}
    </div>}
    {modificationsMode !== 'hidden' && <div className="storefront-card__hover">
      {theme.visibility.availability && <span className="storefront-card__availability">{displayedProduct.availability.label}</span>}
      {parameters.map((parameter) => <div className="storefront-card-modification" key={parameter.id}>
        <span className="storefront-card-modification__label">{parameter.label}</span>
        <div className={`storefront-card-modification__options${isColorModification(parameter) ? ' storefront-card-modification__options--swatches' : ''}`}>
          {parameter.options.map((option) => <StorefrontCardModificationOption parameter={parameter} option={option} busy={variantBusy} onSelect={(item, candidate) => void selectVariant(item, candidate)} key={option.id} />)}
        </div>
      </div>)}
      {variantError && <span className="storefront-card__variant-error" role="alert">{variantError}</span>}
    </div>}
  </article>;
}

function activeFilterValues(filters: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(filters).map(([key, values]) => [
    key,
    values.filter(Boolean)
  ]).filter(([, values]) => values.length));
}

function storefrontProductCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'товарів';
  const lastDigit = count % 10;
  if (lastDigit === 1) return 'товар';
  if (lastDigit >= 2 && lastDigit <= 4) return 'товари';
  return 'товарів';
}

export function StorefrontFilterPanel({
  filters,
  brandId,
  setBrandId,
  priceDraft,
  setPriceDraft,
  priceFilter,
  applyPriceFilter,
  resetFilters,
  characteristicFilters,
  toggleCharacteristic,
  mobileOpen = false,
  total = 0,
  onMobileClose = () => undefined
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
  mobileOpen?: boolean;
  total?: number;
  onMobileClose?: () => void;
}) {
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const priceMin = Math.floor(filters?.price.min || 0);
  const priceMax = Math.ceil(filters?.price.max || 0);
  const safeMax = Math.max(priceMax, priceMin + 1);
  const draftMin = priceDraft.min || String(priceMin);
  const draftMax = priceDraft.max || String(priceMax || safeMax);
  const hasActiveFilters = brandId !== 'all' || Boolean(priceFilter.min || priceFilter.max) || Object.keys(activeFilterValues(characteristicFilters)).length > 0;
  useEffect(() => {
    if (!mobileOpen) return;
    window.requestAnimationFrame(() => mobileCloseButtonRef.current?.focus());
  }, [mobileOpen]);

  return <>
    <button
      className={`storefront-filter-backdrop${mobileOpen ? ' storefront-filter-backdrop--visible' : ''}`}
      type="button"
      aria-label="Закрити фільтри"
      tabIndex={mobileOpen ? 0 : -1}
      onClick={onMobileClose}
    />
    <aside
      className={`storefront-filter-panel${mobileOpen ? ' storefront-filter-panel--open' : ''}`}
      id="storefront-mobile-filters"
      role={mobileOpen ? 'dialog' : undefined}
      aria-modal={mobileOpen || undefined}
      aria-label="Фільтри каталогу"
    >
      <header className="storefront-filter-panel__mobile-header">
        <button type="button" ref={mobileCloseButtonRef} aria-label="Закрити фільтри" onClick={onMobileClose}><Icon name="chevronLeft" size={24} /></button>
        <h2>Фільтри</h2>
        {hasActiveFilters ? <button type="button" onClick={resetFilters}>Скинути</button> : <span aria-hidden="true" />}
      </header>
      <div className="storefront-filter-panel__body">
        <header className="storefront-filter-panel__desktop-header">
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
      </div>
      <footer className="storefront-filter-panel__mobile-footer">
        <button type="button" onClick={onMobileClose}>Показати {total} {storefrontProductCountLabel(total)}</button>
      </footer>
    </aside>
  </>;
}

function schemaAvailability(status: CatalogAvailabilityStatus) {
  if (status === 'in_stock') return 'https://schema.org/InStock';
  if (status === 'incoming') return 'https://schema.org/PreOrder';
  return 'https://schema.org/OutOfStock';
}

function schemaCondition(condition: CatalogCondition) {
  return condition === 'REFURBISHED' ? 'https://schema.org/RefurbishedCondition' : 'https://schema.org/UsedCondition';
}

const storefrontDefaultTitle = 'Mobile Trend — смартфони';
const storefrontDefaultDescription = 'Вітрина перевірених вживаних та відновлених смартфонів Mobile Trend';

function absoluteStorefrontUrl(value: string) {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function clearStorefrontProductHead() {
  document.head.querySelectorAll('[data-storefront-seo]').forEach((element) => element.remove());
}

function setStorefrontMeta(attribute: 'name' | 'property', key: string, content: string) {
  if (!content) return;
  const selector = `meta[${attribute}="${key}"]`;
  const element = document.head.querySelector<HTMLMetaElement>(selector) || document.createElement('meta');
  element.setAttribute(attribute, key);
  element.content = content;
  element.dataset.storefrontSeo = 'client';
  if (!element.parentNode) document.head.append(element);
}

function resetStorefrontHead() {
  clearStorefrontProductHead();
  document.title = storefrontDefaultTitle;
  const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]') || document.createElement('meta');
  description.name = 'description';
  description.content = storefrontDefaultDescription;
  if (!description.parentNode) document.head.append(description);
}

export function StorefrontProductHead({ product, preview, basePath }: { product: CatalogProduct; preview: boolean; basePath?: string }) {
  useEffect(() => {
    clearStorefrontProductHead();
    const title = product.seoTitle.trim() || product.name;
    const description = product.seoDescription.trim() || product.shortDescription.trim() || product.name;
    const socialDescription = product.socialDescription.trim() || description;
    const resolvedBasePath = basePath ?? (preview ? '/catalog/preview/storefront' : '/storefront');
    const canonicalUrl = absoluteStorefrontUrl(productPath(product.slug, resolvedBasePath));
    const imageUrl = absoluteStorefrontUrl(product.mainImageUrl);
    const images = [product.mainImageUrl, ...(product.gallery || []).map((item) => item.url)]
      .map(absoluteStorefrontUrl)
      .filter(Boolean);
    const additionalProperty = [
      ...baseSpecItems(product).map((item) => ({
        '@type': 'PropertyValue',
        name: item.label,
        value: item.value
      })),
      ...(product.characteristics?.items || []).filter((item) => item.displayValue).map((item) => ({
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

    document.title = title;
    setStorefrontMeta('name', 'description', description);
    setStorefrontMeta('name', 'robots', preview ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    setStorefrontMeta('property', 'og:locale', 'uk_UA');
    setStorefrontMeta('property', 'og:type', 'product');
    setStorefrontMeta('property', 'og:site_name', 'Mobile Trend');
    setStorefrontMeta('property', 'og:title', title);
    setStorefrontMeta('property', 'og:description', socialDescription);
    setStorefrontMeta('property', 'og:url', canonicalUrl);
    setStorefrontMeta('property', 'product:price:amount', String(product.priceUah));
    setStorefrontMeta('property', 'product:price:currency', 'UAH');
    setStorefrontMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setStorefrontMeta('name', 'twitter:title', title);
    setStorefrontMeta('name', 'twitter:description', socialDescription);
    if (imageUrl) {
      setStorefrontMeta('property', 'og:image', imageUrl);
      setStorefrontMeta('property', 'og:image:alt', product.name);
      setStorefrontMeta('name', 'twitter:image', imageUrl);
    }

    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = canonicalUrl;
    canonical.dataset.storefrontSeo = 'client';
    document.head.append(canonical);

    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.dataset.storefrontSeo = 'client';
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: product.productCode,
      image: images,
      description,
      brand: product.brand?.label ? { '@type': 'Brand', name: product.brand.label } : undefined,
      itemCondition: schemaCondition(product.condition),
      additionalProperty,
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'UAH',
        price: product.priceUah,
        availability: schemaAvailability(product.availability.status),
        itemCondition: schemaCondition(product.condition)
      }
    }).replace(/</g, '\\u003c');
    document.head.append(structuredData);

    return resetStorefrontHead;
  }, [basePath, preview, product]);

  return null;
}

function fieldValue(values: Record<string, unknown>, field: PublicField) {
  const value = values[field.key];
  if (field.type === 'checkbox') return Array.isArray(value) ? value.map(String) : [];
  return value == null ? '' : String(value);
}

export function storefrontPhoneDigits(value: unknown) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('380')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

export function formatStorefrontPhone(value: unknown) {
  const digits = storefrontPhoneDigits(value);
  if (!digits) return '';
  let result = '+380';
  if (digits.length > 0) result += ` (${digits.slice(0, 2)}`;
  if (digits.length >= 2) result += ')';
  if (digits.length > 2) result += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) result += `-${digits.slice(5, 7)}`;
  if (digits.length > 7) result += `-${digits.slice(7, 9)}`;
  return result;
}

function formStyleValue(styles: Record<string, string> | undefined, key: string, fallback: string) {
  const value = styles?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function storefrontFormStyles(form: PublicForm): CSSProperties {
  const styles = form.styles || {};
  const accent = formStyleValue(styles, 'accentColor', '#6d5dfc');
  const radius = formStyleValue(styles, 'borderRadius', '12px');
  return {
    '--storefront-form-accent': accent,
    '--storefront-form-button-bg': formStyleValue(styles, 'buttonBackgroundColor', accent),
    '--storefront-form-button-color': formStyleValue(styles, 'buttonTextColor', '#ffffff'),
    '--storefront-form-radius': radius,
    '--storefront-form-control-radius': formStyleValue(styles, 'controlRadius', radius),
    '--storefront-form-choice-accent': formStyleValue(styles, 'choiceAccentColor', accent),
    '--storefront-form-choice-border': formStyleValue(styles, 'choiceBorderColor', '#cfd6e3'),
    '--storefront-form-choice-bg': formStyleValue(styles, 'choiceBackgroundColor', '#ffffff'),
    '--storefront-form-choice-color': formStyleValue(styles, 'choiceTextColor', '#344054'),
    '--storefront-form-checkbox-radius': formStyleValue(styles, 'checkboxRadius', '5px'),
    '--storefront-form-number-bg': formStyleValue(styles, 'numberBlockBackgroundColor', '#f6f4ff'),
    '--storefront-form-number-border': formStyleValue(styles, 'numberBlockBorderColor', '#d8d4ff'),
    '--storefront-form-number-color': formStyleValue(styles, 'numberBlockTextColor', '#172033'),
    '--storefront-form-number-radius': formStyleValue(styles, 'numberBlockRadius', '16px')
  } as CSSProperties;
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
  if (field.type === 'phone' || field.systemFieldType === 'phone') {
    const current = String(fieldValue(values, field));
    return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      required={field.required}
      placeholder="+380 (__) ___-__-__"
      pattern="[+]380 [(][0-9]{2}[)] [0-9]{3}-[0-9]{2}-[0-9]{2}"
      title="Введіть номер у форматі +380 (__) ___-__-__"
      value={current}
      onFocus={() => { if (!current) onChange(field.key, '+380 '); }}
      onBlur={() => { if (!storefrontPhoneDigits(current)) onChange(field.key, ''); }}
      onChange={(event) => onChange(field.key, formatStorefrontPhone(event.target.value) || '+380 ')}
    /></label>;
  }
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text';
  return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><input type={inputType} required={field.required} placeholder={field.placeholder} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)} /></label>;
}

export function StorefrontApplicationForm({
  product,
  form,
  preview,
  basePath
}: {
  product: CatalogProduct;
  form: PublicForm | undefined;
  preview: boolean;
  basePath?: string;
}) {
  const resolvedBasePath = basePath ?? (preview ? '/catalog/preview/storefront' : '/storefront');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<{ number: string } | null>(null);
  useEffect(() => {
    if (!form) return;
    setValues(Object.fromEntries(form.fields
      .filter((field) => field.defaultValue)
      .map((field) => [field.key, field.type === 'phone' || field.systemFieldType === 'phone'
        ? formatStorefrontPhone(field.defaultValue)
        : field.defaultValue])));
    setDone(null);
  }, [form, product.id]);
  const submit = useMutation({
    mutationFn: () => (preview ? api.storefront.previewSubmitApplication : api.storefront.submitApplication)(product.slug, {
      values,
      context: {
        sourceUrl: new URL(productPath(product.slug, resolvedBasePath), window.location.origin).toString(),
        pageTitle: product.name,
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
  const formStyles = storefrontFormStyles(form);
  if (done) return <section className="storefront-form storefront-form--done" style={formStyles}>
    <h2>{form.successMessage || 'Заявку надіслано'}</h2>
    <div className="storefront-form__number"><span>Номер заявки</span><strong>{done.number}</strong></div>
  </section>;

  return <form className="storefront-form" style={formStyles} onSubmit={(event) => void handleSubmit(event)}>
    <div><h2>{form.title}</h2>{form.description && <p>{form.description}</p>}</div>
    {form.fields.map((field) => <PublicFieldControl field={field} values={values} onChange={setField} key={field.key} />)}
    {submit.error && <p className="form-message form-message--error">{submit.error instanceof Error ? submit.error.message : 'Не вдалося надіслати заявку.'}</p>}
    <button className="button button--primary" type="submit" disabled={submit.isPending}>{form.buttonText || 'Надіслати'} <Icon name="arrowRight" size={16} /></button>
  </form>;
}

function StorefrontApplicationModal({
  product,
  form,
  preview,
  basePath,
  onClose
}: {
  product: CatalogProduct;
  form: PublicForm | undefined;
  preview: boolean;
  basePath: string;
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
      <StorefrontApplicationForm product={product} form={form} preview={preview} basePath={basePath} />
    </div>
  </div>;
}

export function StorefrontPage({ preview = false, rootMounted = false }: { preview?: boolean; rootMounted?: boolean }) {
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileFilterTriggerRef = useRef<HTMLButtonElement>(null);
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
  const basePath = preview ? '/catalog/preview/storefront' : rootMounted ? '/' : '/storefront';
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
    enabled: Boolean(settings.data?.selectedFormPublicId),
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
    setMobileFiltersOpen(false);
  }, [slug]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileFiltersOpen(false);
      window.requestAnimationFrame(() => mobileFilterTriggerRef.current?.focus());
    };
    const closeOnDesktopResize = () => {
      if (window.innerWidth > 700) setMobileFiltersOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnDesktopResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnDesktopResize);
    };
  }, [mobileFiltersOpen]);

  function closeMobileFilters() {
    setMobileFiltersOpen(false);
    window.requestAnimationFrame(() => mobileFilterTriggerRef.current?.focus());
  }

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
  const canRequestProduct = Boolean(productData && productData.availability.status !== 'unavailable' && form.data);
  const storefrontTheme = settings.data?.storefrontTheme || defaultStorefrontTheme;
  const productCardTheme = settings.data?.productCardTheme || defaultProductCardTheme;
  const productPageTheme = settings.data?.productPageTheme || defaultProductPageTheme;
  const pageStyle = { ...storefrontThemeStyle(storefrontTheme), ...productCardThemeStyle(productCardTheme), ...productPageThemeStyle(productPageTheme) };
  const brandHref = storefrontBrandHref(storefrontTheme.header.logoLink, basePath);

  return <main className="storefront-page" style={pageStyle}>
    <header className="storefront-header">
      <a href={brandHref} className="storefront-brand">
        {storefrontTheme.header.logoUrl
          ? <img className="storefront-brand__logo" src={storefrontTheme.header.logoUrl} alt={storefrontTheme.header.brandText || 'Логотип магазину'} />
          : <span>{storefrontTheme.header.brandMark}</span>}
        {storefrontTheme.header.brandText && <strong>{storefrontTheme.header.brandText}</strong>}
      </a>
      {preview
        ? <a className="button button--secondary button--small storefront-header__action" href="/catalog/products">До каталогу</a>
        : !rootMounted && <a className="button button--secondary button--small storefront-header__action" href="/login">У робочий простір</a>}
    </header>
    {preview && <div className="storefront-preview-banner">Preview магазину · сторінка закрита від індексації</div>}

    {slug ? productData ? <>
    <StorefrontProductHead product={productData} preview={preview} basePath={basePath} />
    <StorefrontProductDetailPage
      product={productData}
      preview={preview}
      basePath={basePath}
      canRequestProduct={canRequestProduct}
      onRequest={() => setRequestProduct(productData)}
      theme={productPageTheme}
    />
    </> : <section className="storefront-empty"><Icon name="phone" size={32} /><h2>{product.isLoading ? 'Завантаження товару...' : 'Товар не знайдено'}</h2></section> : <section className="storefront-catalog">
      <div className="storefront-hero">
        <p className="eyebrow">{storefrontTheme.hero.eyebrowText}</p>
        <h1>{storefrontTheme.hero.title}</h1>
        {storefrontTheme.hero.subtitle && <p className="storefront-hero__subtitle">{storefrontTheme.hero.subtitle}</p>}
      </div>
      <div className="storefront-controls">
        <label className="field"><span>Пошук</span><input value={search} onChange={updateSearch} placeholder={storefrontTheme.controls.searchPlaceholder} /></label>
        <div className="storefront-controls__actions">
          {storefrontTheme.filters.visible && <button
            className="storefront-mobile-filter-trigger"
            type="button"
            ref={mobileFilterTriggerRef}
            aria-controls="storefront-mobile-filters"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen(true)}
          ><Icon name="characteristics" size={19} /> Фільтри</button>}
          <div className="storefront-controls__sort"><StyledSelect value={sort} options={sortOptions} onChange={(value) => setSort(String(value))} /></div>
        </div>
      </div>
      <div className="storefront-catalog__layout">
        {storefrontTheme.filters.visible && <StorefrontFilterPanel
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
          mobileOpen={mobileFiltersOpen}
          total={products.data?.total ?? items.length}
          onMobileClose={closeMobileFilters}
        />}
        <div className="storefront-grid">
          {items.map((item) => <StorefrontProductCard
            product={item}
            preview={preview}
            basePath={basePath}
            formAvailable={Boolean(form.data)}
            onRequest={setRequestProduct}
            theme={productCardTheme}
            key={item.productCode}
          />)}
        </div>
      </div>
      {!products.isLoading && !items.length && <div className="storefront-empty"><Icon name="phone" size={32} /><h2>Товарів не знайдено</h2></div>}
    </section>}
    {requestProduct && form.data && requestProduct.availability.status !== 'unavailable' && <StorefrontApplicationModal product={requestProduct} form={form.data} preview={preview} basePath={basePath} onClose={() => setRequestProduct(null)} />}
  </main>;
}
