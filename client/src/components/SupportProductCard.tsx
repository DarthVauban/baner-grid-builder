import type { ReactNode } from 'react';
import type { SupportProductCard as SupportProductCardType } from '../types/support-chat';
import '../styles/support-product-card.css';

function priceLabel(card: SupportProductCardType) {
  const rawPrice = String(card.price || '').trim();
  if (!rawPrice) return 'Ціну уточнюйте';
  const value = Number(rawPrice.replace(',', '.').replace(/\s+/gu, ''));
  if (!Number.isFinite(value)) return card.price || 'Ціну уточнюйте';
  const currency = card.currency.toUpperCase() === 'UAH' ? 'грн' : card.currency;
  return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value)} ${currency}`.trim();
}

function productUrlKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase().replace(/^www\./u, '')}${decodeURIComponent(url.pathname).replace(/\/+$/u, '') || '/'}`;
  } catch {
    return '';
  }
}

export function SupportMessageText({ body, productCards }: { body: string; productCards: SupportProductCardType[] }) {
  const cardUrls = new Set(productCards.map((card) => productUrlKey(card.url)).filter(Boolean));
  const parts = body.split(/(https?:\/\/[^\s<>"']+)/giu);
  const rendered = parts.map((part, index): ReactNode => {
    if (!/^https?:\/\//iu.test(part)) return part;
    const clean = part.replace(/[),.;!?]+$/gu, '');
    if (cardUrls.has(productUrlKey(clean))) return part.slice(clean.length);
    return <a key={`${clean}-${index}`} href={clean} target="_blank" rel="noreferrer">{clean}</a>;
  });
  return rendered.some((part) => typeof part !== 'string' || part.trim()) ? <p>{rendered}</p> : null;
}

function ProductImage({ card }: { card: SupportProductCardType }) {
  if (card.imageUrl) return <img src={card.imageUrl} alt="" loading="lazy" />;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v12H5zM8 6.5l1.4-2h5.2l1.4 2M8 10h8M8 13h5" /></svg>;
}

export function SupportProductCard({ card }: { card: SupportProductCardType }) {
  return <a className="support-product-card" href={card.url} target="_blank" rel="noreferrer" aria-label={`Відкрити товар ${card.title}`}>
    <span className="support-product-card__image"><ProductImage card={card} /></span>
    <span className="support-product-card__copy">
      <small>{card.source === 'page' ? 'Товар зі сторінки звернення' : 'Товар Хорошоп'}{card.sku ? ` · ${card.sku}` : ''}</small>
      <strong>{card.title}</strong>
      <span><b>{priceLabel(card)}</b>{card.availability && <em>{card.availability}</em>}</span>
    </span>
    <svg className="support-product-card__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10v10M19 5 8 16M5 9v10h10" /></svg>
  </a>;
}
