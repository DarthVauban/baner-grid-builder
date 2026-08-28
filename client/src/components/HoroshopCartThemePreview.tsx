import type { HoroshopCartThemeId } from '../types/horoshop-cart-theme';

const recommendations = [
  { name: 'Захисне скло Samsung A26', price: '249 грн', tone: 'blue' },
  { name: 'Накладка Cosmic Shield', price: '279 грн', tone: 'violet' },
  { name: 'Зарядний пристрій 30W', price: '759 грн', tone: 'yellow' },
  { name: 'Power Bank Joyroom 20000', price: '2 299 грн', tone: 'graphite' }
];

function ProductMark({ tone = 'phone' }: { tone?: string }) {
  return <span className={`cart-theme-preview__product-mark is-${tone}`}><i /></span>;
}

function RecommendationCards() {
  return <div className="cart-theme-preview__recommendation-track">
    {recommendations.map((product) => <article className="cart-theme-preview__recommendation" key={product.name}>
      <ProductMark tone={product.tone} />
      <strong>{product.name}</strong>
      <b>{product.price}</b>
      <span>До кошика</span>
    </article>)}
  </div>;
}

function CartProduct({
  name = 'Смартфон Samsung A26 5G 6/128GB Black',
  price = '10 999 грн',
  tone = 'phone'
}: {
  name?: string;
  price?: string;
  tone?: string;
}) {
  return <div className="cart-theme-preview__cart-product">
    <ProductMark tone={tone} />
    <div><strong>{name}</strong><small>{price}</small></div>
    <span className="cart-theme-preview__counter">− <b>1</b> +</span>
    <b className="cart-theme-preview__line-price">{price}</b>
  </div>;
}

function DesktopPreview() {
  return <div className="cart-theme-preview__stage">
    <div className="cart-theme-preview__site"><span /><span /><span /><span /></div>
    <section className="cart-theme-preview__modal">
      <header><strong>Кошик</strong><span>×</span></header>
      <div className="cart-theme-preview__desktop-grid">
        <div className="cart-theme-preview__summary">
          <CartProduct />
          <CartProduct name="Захисне скло Samsung A26" price="299 грн" tone="blue" />
          <CartProduct name="Накладка Cosmic Shield" price="279 грн" tone="violet" />
        </div>
        <div className="cart-theme-preview__recommendations">
          <h3>Рекомендуємо придбати</h3>
          <RecommendationCards />
          <span className="cart-theme-preview__slider-arrow is-next">›</span>
        </div>
        <div className="cart-theme-preview__checkout-row">
          <div><small>Всього</small><strong>10 999 грн</strong></div>
          <button type="button" tabIndex={-1}>Оформити замовлення</button>
          <span>Є купон зі знижкою?</span>
        </div>
      </div>
    </section>
  </div>;
}

function MobilePreview() {
  return <div className="cart-theme-preview__mobile-stage">
    <div className="cart-theme-preview__mobile-page" />
    <section className="cart-theme-preview__drawer">
      <header><span>‹</span><strong>Кошик</strong></header>
      <CartProduct />
      <button className="cart-theme-preview__coupon" type="button" tabIndex={-1}>Є купон зі знижкою?</button>
      <strong className="cart-theme-preview__mobile-total">10 999 грн</strong>
      <button className="cart-theme-preview__mobile-order" type="button" tabIndex={-1}>Оформити замовлення</button>
      <div className="cart-theme-preview__recommendations">
        <h3>Рекомендуємо придбати</h3>
        <RecommendationCards />
      </div>
    </section>
  </div>;
}

export function HoroshopCartThemePreview({
  themeId,
  compact = false,
  viewport = 'desktop'
}: {
  themeId: HoroshopCartThemeId;
  compact?: boolean;
  viewport?: 'desktop' | 'mobile';
}) {
  return <div className={`cart-theme-preview is-${themeId} is-${viewport}${compact ? ' is-compact' : ''}`} aria-hidden={compact || undefined}>
    {viewport === 'mobile' ? <MobilePreview /> : <DesktopPreview />}
  </div>;
}
