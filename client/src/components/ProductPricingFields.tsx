import type { ProductPricing, ProductSelectionPriceMode } from '../types/product-selection';
import { StyledSelect } from './StyledSelect';
import '../styles/product-pricing.css';

const priceModes = [
  { value: 'none', label: 'Без штучної старої ціни' },
  { value: 'percent', label: 'Відсоток до поточної ціни' },
  { value: 'fixed', label: 'Фіксована надбавка' }
];

export function ProductPricingFields({ pricing, onChange }: {
  pricing: ProductPricing;
  onChange: (patch: Partial<ProductPricing>) => void;
}) {
  return <>
    <label><span>Спосіб розрахунку</span>
      <StyledSelect value={pricing.priceMode} options={priceModes} ariaLabel="Режим старої ціни"
        onChange={(value) => onChange({ priceMode: value as ProductSelectionPriceMode })} />
    </label>
    {pricing.priceMode !== 'none' && <label><span>{pricing.priceMode === 'percent' ? 'Надбавка, %' : 'Надбавка, грн'}</span>
      <input type="number" min="0.01" step={pricing.priceMode === 'percent' ? '0.1' : '1'} value={pricing.priceValue}
        onChange={(event) => onChange({ priceValue: Number(event.target.value) })} />
    </label>}
    <label className="product-pricing-checkbox">
      <input type="checkbox" checked={pricing.highlightPromoPrice}
        onChange={(event) => onChange({ highlightPromoPrice: event.target.checked })} />
      <span><strong>Червона акційна ціна</strong><small>Підсвічувати поточну ціну, коли показується стара.</small></span>
    </label>
  </>;
}
