import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { StyledSelect } from '../StyledSelect';
import { textElementLabels, type TextElement, type Device, type PreviewState, type PrototypeDraft, type Selection } from './model';
import { elementTextStyle, sampleProduct, textValue } from './text-elements';

export function PhoneArtwork({ tone = '#b4a58f' }: { tone?: string }) {
  return <div className="pp-phone-art" style={{ '--phone-tone': tone } as CSSProperties} aria-hidden="true">
    <div className="pp-phone-back"><div className="pp-lenses"><i /><i /><i /><b /></div><span>●</span></div>
    <div className="pp-phone-front"><i /><div /></div>
  </div>;
}

interface CanvasProps {
  draft: PrototypeDraft;
  device: Device;
  state: PreviewState;
  onState: (state: PreviewState) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  testing: boolean;
  productIndex: number;
  onProductIndex: (index: number) => void;
}

export function PrototypeCanvas({ draft, device, state, onState, selection, onSelect, testing, productIndex, onProductIndex }: CanvasProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [closed, setClosed] = useState(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = draft[device];
  const isLead = draft.kind === 'lead-form';
  const isSuccess = isLead && state === 'success';
  const products = draft.product.ids.map((id) => sampleProduct(draft, id));
  const index = productIndex % products.length;
  const product = products[index];

  useEffect(() => {
    if (!testing || state !== 'sending') {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    }
  }, [testing, state]);
  useEffect(() => () => { if (submitTimer.current) clearTimeout(submitTimer.current); }, []);
  useEffect(() => {
    if (!testing || isLead || !draft.product.rotation || products.length < 2) return undefined;
    const timer = setInterval(() => onProductIndex((productIndex + 1) % products.length), draft.product.rotation * 1000);
    return () => clearInterval(timer);
  }, [testing, isLead, draft.product.rotation, products.length, productIndex, onProductIndex]);

  function part(id: Selection, label: string, children: ReactNode, className = '', style?: CSSProperties, Tag: 'div' | 'span' | 'h2' | 'h3' | 'p' | 'del' | 'strong' | 'small' = 'div') {
    return <Tag
      className={`pp-part ${className} ${!testing && selection === id ? 'is-selected' : ''}`}
      style={style}
      data-part={id} data-label={label} role={!testing ? 'button' : undefined}
      tabIndex={!testing ? 0 : undefined} aria-label={!testing ? `Редагувати: ${label}` : undefined}
      onClick={!testing ? (event) => { event.stopPropagation(); onSelect(id); } : undefined}
      onKeyDown={!testing ? (event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); onSelect(id);
        }
      } : undefined}
    >{children}</Tag>;
  }

  function textPart(id: TextElement, Tag: 'span' | 'h2' | 'h3' | 'p' | 'del' | 'strong' | 'small', className = '', value?: ReactNode) {
    return part(id, textElementLabels[id], value ?? textValue(draft, id, product.id), `pp-text-part ${className}`, elementTextStyle(draft, device, id), Tag);
  }

  function buttonStyle(id: 'cta' | 'copyLabel'): CSSProperties {
    const style = elementTextStyle(draft, device, id);
    return { ...style, justifyContent: style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center' };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testing || state === 'sending') return;
    const values = new FormData(event.currentTarget);
    const nextErrors: Record<string, string> = {};
    for (const field of draft.form.fields) {
      const value = String(values.get(field.id) || '').trim();
      if (field.required && !value) nextErrors[field.id] = field.type === 'checkbox' ? 'Підтвердь, щоб продовжити' : 'Заповни це поле';
      else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) nextErrors[field.id] = 'Перевір адресу пошти';
      else if (value && field.type === 'phone' && value.replace(/\D/g, '').length < 10) nextErrors[field.id] = 'Вкажи повний номер телефону';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { onState('errors'); return; }
    onState('sending');
    // Keep sample submissions entirely inside the prototype; no contact is sent or stored.
    submitTimer.current = setTimeout(() => onState('success'), 1100);
  }

  async function copyCode() {
    if (!testing) { onSelect('coupon'); return; }
    try { await navigator.clipboard.writeText(draft.form.code); setNotice('Демонстраційний код скопійовано'); }
    catch { setNotice('Виділи код і скопіюй його вручну'); }
  }

  const style = {
    '--pp-accent': draft.accent, '--pp-card-bg': draft.background, '--pp-card-text': draft.text,
    '--pp-radius': `${draft.radius}px`, '--pp-button-radius': `${draft.buttonRadius}px`,
    '--pp-title-size': `${settings.titleSize}px`, '--pp-padding': `${settings.padding}px`,
    width: settings.width
  } as CSSProperties;

  return <div className={`pp-demo-scene is-${device}`} data-editing={!testing}>
    <div className="pp-demo-site" aria-hidden="true">
      <div className="pp-demo-nav"><b><span>m.</span> mobile trend</b><div /><div /><i /></div>
      <div className="pp-demo-hero"><small>ЗНАЙДИ СВОЄ</small><strong>Технології.<br />У твоєму ритмі.</strong><span /><span /><div className="pp-demo-orbit" /></div>
      <div className="pp-demo-tiles"><i /><i /><i /></div>
    </div>
    <div className={`pp-banner-position ${isLead ? 'is-modal' : 'is-product'}`}>
      {closed && testing ? <div className="pp-closed"><Icon name="check" size={24} /><strong>Банер закрито</strong><button type="button" onClick={() => setClosed(false)}>Показати знову</button></div> : <article
        className={`pp-sample-banner ${isLead ? `is-lead is-${draft.form.layout}` : `is-promo is-${draft.product.layout}`} ${isSuccess ? 'is-success' : ''}`}
        style={style} aria-label={isLead ? 'Прев’ю форми за промокод' : 'Прев’ю товарного банера'}
      >
        <button className="pp-sample-close" type="button" aria-label="Закрити тестовий банер" onClick={() => testing ? setClosed(true) : onSelect('banner')}><Icon name="close" size={17} /></button>
        {isLead && draft.form.layout === 'split' && <div className="pp-lead-visual">{textPart('coverEyebrow', 'span')}<div className="pp-gift-orbit"><i />{textPart('coverOffer', 'strong')}</div>{textPart('coverBody', 'p')}{textPart('coverBrand', 'small')}</div>}
        <div className="pp-sample-content">
          {isSuccess ? <>
            <div className="pp-success-icon"><Icon name="check" size={28} /></div>
            {part('success', 'Повідомлення про успіх', <>{textPart('successTitle', 'h2')}{textPart('successBody', 'p')}</>)}
            {part('coupon', 'Промокод', <div className="pp-sample-coupon">{textPart('discount', 'span')}{textPart('code', 'strong')}{textPart('couponNote', 'small')}</div>)}
            {part('copyLabel', 'Кнопка копіювання', <button className="pp-sample-cta" style={buttonStyle('copyLabel')} type="button" tabIndex={testing ? 0 : -1} onClick={() => testing && void copyCode()}>{draft.form.copyLabel}<Icon name="copy" size={17} /></button>)}
          </> : <>
            {part('copy', 'Заголовок і текст', <>{textPart('eyebrow', 'span', 'pp-sample-eyebrow')}{textPart('title', 'h2')}{textPart('body', 'p')}</>)}
            {isLead ? <form noValidate onSubmit={submit}>
              <div className="pp-sample-fields">
                {draft.form.fields.map((field) => {
                  const error = state === 'errors' ? errors[field.id] || (!Object.keys(errors).length && field.required ? 'Перевір це поле' : '') : '';
                  const inputProps = { id: `sample-${field.id}`, name: field.id, placeholder: field.placeholder, required: field.required, disabled: state === 'sending', tabIndex: testing ? 0 : -1, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `error-${field.id}` : undefined };
                  return <div className={`pp-sample-field is-${field.width}`} key={field.id}>
                    {part(`field:${field.id}`, field.label || 'Поле форми', <>
                      {field.type === 'checkbox' ? <label className="pp-sample-check"><input {...inputProps} type="checkbox" /><span style={elementTextStyle(draft, device, `field:${field.id}`)}>{field.label}{field.required && ' *'}</span></label> : <>
                        <label htmlFor={inputProps.id} style={elementTextStyle(draft, device, `field:${field.id}`)}>{field.label}{field.required && <b> *</b>}</label>
                        {field.type === 'textarea' ? <textarea {...inputProps} rows={2} /> : field.type === 'select' ? <>
                          <input type="hidden" name={field.id} value={selectedOptions[field.id] || ''} />
                          <StyledSelect ariaLabel={`${field.label}${field.required ? ' *' : ''}`} className={error ? 'pp-select-error' : ''} disabled={!testing || state === 'sending'} value={selectedOptions[field.id] || ''} onChange={(value) => setSelectedOptions((current) => ({ ...current, [field.id]: value }))} options={[{ value: '', label: field.placeholder || 'Обери варіант' }, ...Array.from(new Set(field.options.split('\n').filter(Boolean))).map((value) => ({ value, label: value }))]} />
                        </> : <input {...inputProps} type={field.type === 'phone' ? 'tel' : field.type} />}
                      </>}
                      {error && <small className="pp-field-error" id={`error-${field.id}`}>{error}</small>}
                    </>)}
                  </div>;
                })}
              </div>
              {part('cta', 'Кнопка отримання', <button className="pp-sample-cta" style={buttonStyle('cta')} type={testing ? 'submit' : 'button'} disabled={state === 'sending'} tabIndex={testing ? 0 : -1}>{state === 'sending' ? <><span className="pp-spinner" /> Надсилаємо…</> : <>{draft.button}<Icon name="arrowRight" size={18} /></>}</button>)}
              {textPart('footnote', 'small', 'pp-sample-footnote')}
            </form> : <>
              {product && part('products', 'Картка товару', <div className="pp-sample-product">
                {part('productImage', 'Фото товару', <div className="pp-product-image-content">{/^https?:\/\//i.test(product.imageUrl) ? <img src={product.imageUrl} alt={product.title} draggable={false} style={{ objectFit: draft.product.image.fit }} /> : <PhoneArtwork tone={product.tone} />}</div>, 'pp-product-image', { height: settings.imageHeight, borderRadius: draft.product.image.radius, background: draft.product.image.background })}
                <div className="pp-product-copy">
                  {draft.product.showBadge && textPart('productBadge', 'span', 'pp-product-badge')}
                  {textPart('productTitle', 'h3')}{textPart('productVariant', 'p')}
                  <div className="pp-price">{draft.product.showOldPrice && textPart('oldPrice', 'del', '', `${product.oldPrice.toLocaleString('uk-UA')} ₴`)}{textPart('price', 'strong', '', <>{product.price.toLocaleString('uk-UA')} <small>₴</small></>)}</div>
                  {part('cta', 'Кнопка товару', <button type="button" className="pp-sample-cta" style={buttonStyle('cta')} tabIndex={testing ? 0 : -1} onClick={() => testing && setNotice(draft.product.action === 'cart' ? 'Тест: товар додано до кошика' : `Тест: перехід до ${product.title}`)}>{draft.button}<Icon name="arrowRight" size={16} /></button>)}
                </div>
              </div>)}
              <div className="pp-carousel"><span>{index + 1} / {products.length}</span><div>{products.map((item, itemIndex) => <button key={item.id} type="button" className={itemIndex === index ? 'is-active' : ''} aria-label={`Показати ${item.title}`} aria-pressed={itemIndex === index} onClick={() => onProductIndex(itemIndex)} />)}</div><button type="button" aria-label="Наступний товар" onClick={() => onProductIndex((index + 1) % products.length)}><Icon name="arrowRight" size={16} /></button></div>
            </>}
          </>}
          {notice && <div className="pp-canvas-notice" role="status">{notice}<button type="button" aria-label="Прибрати повідомлення" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}
        </div>
      </article>}
    </div>
  </div>;
}
