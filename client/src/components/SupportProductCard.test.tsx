import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SupportProductCard as SupportProductCardType } from '../types/support-chat';
import { SupportMessageText, SupportProductCard } from './SupportProductCard';

const card: SupportProductCardType = {
  id: 'product-1',
  productId: 'product-1',
  modificationId: null,
  title: 'Apple iPhone 16 128GB Black',
  sku: 'IPHONE-16',
  brand: 'Apple',
  price: '35999',
  oldPrice: '37999',
  currency: 'UAH',
  availability: 'В наявності',
  visible: true,
  active: true,
  imageUrl: '',
  url: 'https://mobiletrend.com.ua/apple-iphone-16/',
  source: 'message'
};

describe('SupportProductCard', () => {
  it('replaces the raw Horoshop product URL with a functional product card', () => {
    render(<>
      <SupportMessageText body={`Рекомендую ${card.url}`} productCards={[card]} />
      <SupportProductCard card={card} />
    </>);

    expect(screen.queryByText(card.url)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Відкрити товар ${card.title}` })).toHaveAttribute('href', card.url);
    expect(screen.getByText('35 999 грн')).toBeInTheDocument();
    expect(screen.getByText('В наявності')).toBeInTheDocument();
  });
});
