import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren, ReactElement } from 'react';
import { api } from '../lib/api';
import type { CatalogProduct } from '../types/catalog';
import appStyles from '../styles/app.css?raw';
import { formatStorefrontPhone, StorefrontApplicationForm, StorefrontProductCard, StorefrontProductDetailPage } from './StorefrontPage';

vi.mock('swiper/modules', () => ({
  Keyboard: {},
  Navigation: {},
  Pagination: {},
  Thumbs: {}
}));

vi.mock('swiper/react', async () => {
  const React = await import('react');
  type MockSwiper = {
    realIndex: number;
    destroyed: boolean;
    slideTo: (index: number, duration?: number) => void;
    slidePrev: () => void;
    slideNext: () => void;
  };
  type MockSwiperProps = PropsWithChildren<{
    className?: string;
    initialSlide?: number;
    onSwiper?: (swiper: MockSwiper) => void;
    onSlideChange?: (swiper: MockSwiper) => void;
    'aria-label'?: string;
  }>;

  function Swiper({ children, className, initialSlide = 0, onSwiper, onSlideChange, 'aria-label': ariaLabel }: MockSwiperProps) {
    const slideCount = React.Children.count(children);
    const [activeIndex, setActiveIndex] = React.useState(initialSlide);
    const onSlideChangeRef = React.useRef(onSlideChange);
    onSlideChangeRef.current = onSlideChange;
    const swiperRef = React.useRef<MockSwiper | null>(null);

    if (!swiperRef.current) {
      const clamp = (index: number) => Math.max(0, Math.min(slideCount - 1, index));
      swiperRef.current = {
        realIndex: initialSlide,
        destroyed: false,
        slideTo: (index) => setActiveIndex(clamp(index)),
        slidePrev: () => setActiveIndex((index) => clamp(index - 1)),
        slideNext: () => setActiveIndex((index) => clamp(index + 1))
      };
    }

    swiperRef.current.realIndex = activeIndex;
    React.useEffect(() => { onSwiper?.(swiperRef.current!); }, []);
    React.useEffect(() => {
      swiperRef.current!.realIndex = activeIndex;
      onSlideChangeRef.current?.(swiperRef.current!);
    }, [activeIndex]);

    return <div className={className} data-active-index={activeIndex} aria-label={ariaLabel}>{children}</div>;
  }

  return {
    Swiper,
    SwiperSlide: ({ children, className }: PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>
  };
});

afterEach(() => vi.restoreAllMocks());

describe('storefront product layout styles', () => {
  it('keeps equal hero columns and fills their shared row without stretching gallery images', () => {
    expect(appStyles).toMatch(/\.storefront-product-view__hero\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\);[^}]*align-items:\s*stretch/);
    expect(appStyles).toMatch(/\.storefront-product-view__media\s*\{[^}]*min-height:\s*clamp\(500px,34vw,620px\);[^}]*height:\s*auto/);
    expect(appStyles).toMatch(/\.storefront-gallery__stage img\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*max-width:\s*100%;[^}]*max-height:\s*100%/);
    expect(appStyles).toMatch(/\.storefront-gallery-lightbox__thumbs-shell\s*\{[^}]*position:\s*fixed;[^}]*right:\s*0;[^}]*left:\s*0;[^}]*justify-content:\s*center/);
    expect(appStyles).toMatch(/\.application-details-modal\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,1fr\) auto;[^}]*overflow:\s*hidden/);
    expect(appStyles).toMatch(/\.application-details-modal__content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto/);
  });
});

function renderWithQueryClient(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}

const product: CatalogProduct = {
  id: 'product-1',
  productCode: 'MT-00001',
  name: 'Apple iPhone 13 128 GB Midnight',
  condition: 'USED',
  conditionLabel: 'Вживаний',
  stockCount: 1,
  incomingCount: 0,
  availability: { status: 'in_stock', label: 'В наявності' },
  priceUah: 19999,
  priceLabel: '19 999 ₴',
  publicationStatus: 'PUBLISHED',
  publicationStatusLabel: 'Опубліковано',
  slug: 'iphone-13-midnight',
  publicPath: '/storefront/smartphones/iphone-13-midnight',
  brand: { id: 'brand-1', label: 'Apple', logoUrl: '/apple.webp' },
  mainImageUrl: '/iphone-main.webp',
  gallery: [{ url: '/iphone-side.webp', alt: 'iPhone збоку' }],
  shortDescription: 'Перевірений смартфон у відмінному стані.',
  description: 'Опис товару',
  descriptionHtml: '<p>Повний опис смартфона.</p>',
  characteristics: {
    templateId: 'template-1',
    templateLabel: 'Смартфони',
    items: [{
      key: 'storage',
      label: 'Памʼять',
      type: 'text',
      value: '128 GB',
      displayValue: '128 GB',
      unit: '',
      filterable: true,
      isModifier: true,
      sortOrder: 0
    }]
  },
  modifications: {
    groupId: 'group-1',
    groupLabel: 'iPhone 13',
    groupSlug: 'iphone-13',
    mainProductId: 'product-1',
    isMain: true,
    items: [],
    parameters: [{
      id: 'parameter-1',
      key: 'color',
      label: 'Колір',
      currentValueId: 'midnight',
      currentValueLabel: 'Midnight',
      options: [{
        id: 'midnight',
        value: 'midnight',
        label: 'Midnight',
        selected: true,
        compatible: true,
        product: null
      }, {
        id: 'blue',
        value: 'blue',
        label: 'Blue',
        selected: false,
        compatible: true,
        product: {
          id: 'product-2',
          productCode: 'MT-00002',
          name: 'Apple iPhone 13 128 GB Blue',
          slug: 'iphone-13-blue',
          publicPath: '/storefront/smartphones/iphone-13-blue',
          priceLabel: '20 499 ₴',
          availability: { status: 'in_stock', label: 'В наявності' },
          mainImageUrl: '/iphone-blue.webp'
        }
      }]
    }]
  },
  seoTitle: '',
  seoDescription: '',
  socialDescription: '',
  bodyCondition: 'Відмінний',
  displayCondition: 'Без подряпин',
  batteryHealth: '91%',
  warranty: '3 місяці',
  includedAccessories: '',
  diagnostics: {},
  version: 1,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z'
};

describe('StorefrontProductDetailPage', () => {
  it('keeps equal hero cards and switches description and characteristics inside one tabbed block', async () => {
    const onRequest = vi.fn();
    const { container } = render(<MemoryRouter>
      <StorefrontProductDetailPage
        product={product}
        preview={false}
        basePath="/storefront"
        canRequestProduct
        onRequest={onRequest}
      />
    </MemoryRouter>);

    expect(container.querySelector('[data-product-detail="rebuilt"]')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Фото товару' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Опис товару' })).toBeInTheDocument();
    expect(screen.getByText('Повний опис смартфона.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Характеристики' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Опис товару' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Характеристики' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Опис товару');
    expect(container.querySelectorAll('.storefront-gallery__thumb-slide')).toHaveLength(2);
    expect(container.querySelector('.storefront-gallery__thumb-button--active')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Попереднє фото' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Наступне фото' })).toBeEnabled();
    expect([...container.querySelectorAll('.storefront-gallery img')].every((image) => image.getAttribute('draggable') === 'false')).toBe(true);

    const stageSwiper = container.querySelector('.storefront-gallery__stage-swiper');
    await userEvent.click(screen.getByRole('button', { name: 'Наступне фото' }));
    expect(stageSwiper).toHaveAttribute('data-active-index', '1');
    expect(container.querySelectorAll('.storefront-gallery__thumb-button')[1]).toHaveAttribute('aria-current', 'true');

    await userEvent.click(container.querySelectorAll('.storefront-gallery__thumb-button')[0]);
    expect(stageSwiper).toHaveAttribute('data-active-index', '0');
    expect(container.querySelectorAll('.storefront-gallery__thumb-button')[0]).toHaveAttribute('aria-current', 'true');

    expect(screen.getByRole('button', { name: 'Midnight' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Blue' })).toHaveAttribute('href', '/storefront/smartphones/iphone-13-blue');

    await userEvent.click(screen.getByRole('tab', { name: 'Характеристики' }));
    expect(screen.getByRole('heading', { name: 'Характеристики' })).toBeInTheDocument();
    expect(screen.getByText('128 GB')).toBeInTheDocument();
    expect(screen.queryByText('Повний опис смартфона.')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Характеристики' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Опис товару' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Повний опис смартфона.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Оформити заявку/ }));
    expect(onRequest).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getAllByRole('button', { name: 'Відкрити фото на весь екран' })[0]);
    const lightbox = screen.getByRole('dialog', { name: 'Перегляд фото' });
    expect([...lightbox.querySelectorAll('img')].every((image) => image.getAttribute('draggable') === 'false')).toBe(true);
    expect(lightbox.querySelectorAll('.storefront-gallery-lightbox__thumb-slide')).toHaveLength(2);
    expect(lightbox.querySelector('.storefront-gallery-lightbox__thumbs-shell .storefront-gallery-lightbox__thumbs')).toBeInTheDocument();
    expect(lightbox.querySelectorAll('.storefront-gallery-lightbox__thumb-button')[0]).toHaveAttribute('aria-current', 'true');

    await userEvent.click(within(lightbox).getByRole('button', { name: 'Наступне фото' }));
    expect(lightbox.querySelector('.storefront-gallery-lightbox__swiper')).toHaveAttribute('data-active-index', '1');
    expect(lightbox.querySelectorAll('.storefront-gallery-lightbox__thumb-button')[1]).toHaveAttribute('aria-current', 'true');
  });

  it('allows an order to be started from the test storefront when a form is connected', async () => {
    const onRequest = vi.fn();
    render(<MemoryRouter>
      <StorefrontProductDetailPage
        product={product}
        preview
        basePath="/catalog/preview/storefront"
        canRequestProduct
        onRequest={onRequest}
      />
    </MemoryRouter>);

    const action = screen.getByRole('button', { name: /Оформити заявку/ });
    expect(action).toBeEnabled();
    expect(screen.queryByText('Preview без заявки')).not.toBeInTheDocument();
    await userEvent.click(action);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });
});

describe('StorefrontProductCard', () => {
  it('switches the card in place and opens the assigned form for the selected modification', async () => {
    const variantProduct: CatalogProduct = {
      ...product,
      id: 'product-2',
      productCode: 'MT-00002',
      name: 'Apple iPhone 13 128 GB Blue',
      slug: 'iphone-13-blue',
      publicPath: '/storefront/smartphones/iphone-13-blue',
      priceUah: 20499,
      priceLabel: '20 499 ₴',
      mainImageUrl: '/iphone-blue.webp',
      modifications: product.modifications ? {
        ...product.modifications,
        isMain: false,
        parameters: product.modifications.parameters.map((parameter) => ({
          ...parameter,
          currentValueId: 'blue',
          currentValueLabel: 'Blue',
          options: parameter.options.map((option) => ({ ...option, selected: option.id === 'blue' }))
        }))
      } : undefined
    };
    const loadVariant = vi.spyOn(api.storefront, 'get').mockResolvedValue(variantProduct);
    const onRequest = vi.fn();
    const { container } = renderWithQueryClient(<StorefrontProductCard
      product={product}
      preview={false}
      formAvailable
      onRequest={onRequest}
    />);

    expect(screen.queryByRole('link', { name: 'Blue' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Blue' }));

    expect(loadVariant).toHaveBeenCalledWith('iphone-13-blue');
    expect(await screen.findByText('Apple iPhone 13 128 GB Blue')).toBeInTheDocument();
    expect(screen.getByText('MT-00002 · В наявності')).toBeInTheDocument();
    expect(screen.getByText('20 499 ₴')).toBeInTheDocument();
    expect(container.querySelector('.storefront-card__body')).toHaveAttribute('href', '/storefront/smartphones/iphone-13-blue');

    await userEvent.click(screen.getByRole('button', { name: 'Купити' }));
    expect(onRequest).toHaveBeenCalledWith(variantProduct);
  });

  it('enables the buy button on the test storefront when a form is connected', async () => {
    const onRequest = vi.fn();
    renderWithQueryClient(<StorefrontProductCard
      product={product}
      preview
      formAvailable
      onRequest={onRequest}
    />);

    const buyButton = screen.getByRole('button', { name: 'Купити' });
    expect(buyButton).toBeEnabled();
    await userEvent.click(buyButton);
    expect(onRequest).toHaveBeenCalledWith(product);
  });
});

describe('StorefrontApplicationForm', () => {
  it('masks phone values, submits a direct product URL and uses builder styles on success', async () => {
    const submit = vi.spyOn(api.storefront, 'previewSubmitApplication').mockResolvedValue({
      id: 'application-1',
      number: '00029',
      status: 'new'
    });
    const form = {
      id: 'form-1',
      title: 'Оформлення замовлення',
      description: '',
      buttonText: 'Надіслати',
      successMessage: 'Заявку надіслано. Менеджер зв’яжеться з вами.',
      styles: {
        accentColor: '#5b4ce2',
        buttonBackgroundColor: '#123456',
        numberBlockBackgroundColor: '#f0efff',
        numberBlockBorderColor: '#c8c3ff',
        numberBlockTextColor: '#211866',
        numberBlockRadius: '18px'
      },
      fields: [{
        key: 'phone',
        label: 'Телефон',
        type: 'phone',
        placeholder: '',
        helpText: '',
        defaultValue: '',
        required: true,
        systemFieldType: 'phone',
        options: []
      }]
    };

    renderWithQueryClient(<StorefrontApplicationForm product={product} form={form} preview />);
    const phone = screen.getByRole('textbox', { name: /Телефон/ });
    await userEvent.click(phone);
    await userEvent.type(phone, '501112233');
    expect(phone).toHaveValue('+380 (50) 111-22-33');
    expect(formatStorefrontPhone('0501112233')).toBe('+380 (50) 111-22-33');

    await userEvent.click(screen.getByRole('button', { name: /Надіслати/ }));
    expect(submit).toHaveBeenCalledWith(product.slug, expect.objectContaining({
      values: { phone: '+380 (50) 111-22-33' },
      context: expect.objectContaining({
        sourceUrl: new URL(`/catalog/preview/storefront/smartphones/${product.slug}`, window.location.origin).toString(),
        pageTitle: product.name
      })
    }));

    expect(await screen.findByText('00029')).toBeInTheDocument();
    expect(screen.getByText('Номер заявки')).toBeInTheDocument();
    const success = screen.getByText('00029').closest('.storefront-form');
    expect(success).toHaveStyle({ '--storefront-form-number-color': '#211866' });
    expect(success).toHaveStyle({ '--storefront-form-number-radius': '18px' });
  });
});
