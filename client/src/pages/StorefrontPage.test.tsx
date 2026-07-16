import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import type { CatalogProduct } from '../types/catalog';
import { StorefrontProductDetailPage } from './StorefrontPage';

vi.mock('swiper/modules', () => ({
  Keyboard: {},
  Navigation: {},
  Pagination: {},
  Thumbs: {}
}));

vi.mock('swiper/react', () => ({
  Swiper: ({ children, className }: PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>,
  SwiperSlide: ({ children, className }: PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>
}));

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
  it('keeps the gallery and modification links while showing description and characteristics together', async () => {
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
    expect(screen.getByRole('heading', { name: 'Характеристики' })).toBeInTheDocument();
    expect(screen.getByText('128 GB')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Midnight' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Blue' })).toHaveAttribute('href', '/storefront/smartphones/iphone-13-blue');

    await userEvent.click(screen.getByRole('button', { name: /Оформити заявку/ }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });
});
