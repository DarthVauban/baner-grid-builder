import type { PopupPromoProduct } from '../../types/popup-banner';
import { useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { StyledSelect } from '../StyledSelect';
import { Icon } from '../Icon';
import { PhoneArtwork } from '../popup-prototype/PrototypeCanvas';
import { demoProducts } from '../popup-prototype/model';
import { effectiveStyle, isContainer, safeHref, type BlockNode, type BlockStyle, type Device } from './block-model';

export function blockCss(style: BlockStyle, container: boolean): CSSProperties {
  return {
    display: container ? 'flex' : 'block', flexDirection: style.direction, flexWrap: style.wrap ? 'wrap' : 'nowrap',
    justifyContent: style.justify, alignItems: style.align, columnGap: style.gap, rowGap: style.rowGap,
    width: style.widthMode === 'fixed' ? style.width : style.widthMode === 'percent' ? `${Math.min(100, style.width)}%` : style.widthMode === 'fill' ? '100%' : 'auto',
    height: style.heightMode === 'fixed' ? style.height : 'auto', minHeight: style.minHeight, minWidth: 0,
    maxWidth: style.maxWidth || undefined, flexGrow: style.grow, flexShrink: style.shrink ? 1 : 0,
    padding: `${style.paddingTop}px ${style.paddingRight}px ${style.paddingBottom}px ${style.paddingLeft}px`,
    margin: `${style.marginTop}px ${style.marginRight}px ${style.marginBottom}px ${style.marginLeft}px`,
    background: style.background, color: style.color, borderRadius: style.radius,
    border: `${style.borderWidth}px ${style.borderStyle} ${style.borderColor}`,
    boxShadow: ({ none: 'none', soft: '0 4px 16px #29213b12', medium: '0 10px 35px #29213b20', large: '0 24px 60px #29213b25' })[style.shadow],
    opacity: style.opacity, fontSize: style.fontSize, fontWeight: style.fontWeight, fontFamily: style.fontFamily,
    lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textAlign: style.textAlign, fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none', overflow: style.overflow
  };
}
export type DropPlacement = 'before' | 'inside' | 'after';
interface RendererProps {
  products?: PopupPromoProduct[]; campaignCode?: string;
  root: BlockNode; device: Device; selectedId: string; testing: boolean; onSelect: (id: string) => void;
  onDrop: (sourceId: string, targetId: string, placement: DropPlacement) => void;
}

function Countdown({ node, testing, onExpire }: { node: BlockNode; testing: boolean; onExpire: () => void }) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const deadline = node.props.timerMode === 'deadline' ? Date.parse(node.props.deadlineAt) : started + node.props.durationMinutes * 60000;
  const remaining = Math.max(0, Math.ceil((deadline - (testing ? now : started)) / 1000));
  useEffect(() => {
    if (!testing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [testing]);
  useEffect(() => { if (testing && Number.isFinite(deadline) && remaining === 0 && node.props.hideOnExpire) onExpire(); }, [testing, deadline, remaining, node.props.hideOnExpire, onExpire]);
  if (!Number.isFinite(deadline)) return <span className="pb-placeholder">Задай дату завершення таймера</span>;
  return <div className="pb-timer" role="timer" aria-label="Відлік часу">{[Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60].map((value, index) => <span key={index}><strong>{String(value).padStart(2, '0')}</strong><small>{['Дні', 'Год', 'Хв', 'Сек'][index]}</small></span>)}</div>;
}

function FormPreview({ node, style, children, testing }: { node: BlockNode; style: CSSProperties; children: ReactNode; testing: boolean }) {
  const [sent, setSent] = useState(false);
  if (testing && sent) return <div style={style}><p role="status">{node.props.successMessage}</p><button type="button" onClick={() => setSent(false)}>Заповнити знову</button></div>;
  return <form style={style} onSubmit={(event) => { event.preventDefault(); if (testing) setSent(true); }}>{children}</form>;
}
function FieldPreview({ node, testing }: { node: BlockNode; testing: boolean }) {
  const [option, setOption] = useState('');
  const [invalid, setInvalid] = useState(false);
  const props = node.props;
  const id = `pb-input-${node.id}`;
  const common = { id, name: node.id, placeholder: props.placeholder, required: props.required, tabIndex: testing ? 0 : -1 };
  return <div className="pb-form-field">
    {props.fieldType === 'checkbox' ? <label className="pb-check"><input {...common} type="checkbox" /><span>{props.text}{props.required ? ' *' : ''}</span></label> : <>
      <label htmlFor={id}>{props.text}{props.required ? ' *' : ''}</label>
      {props.fieldType === 'textarea' ? <textarea {...common} rows={3} /> : props.fieldType === 'select' ? <>
        <StyledSelect ariaLabel={props.text} value={option} disabled={!testing} onChange={(value) => { setOption(value); setInvalid(false); }} options={[{ value: '', label: props.placeholder || 'Обери варіант' }, ...Array.from(new Set(props.options.split('\n').filter(Boolean))).map((value) => ({ value, label: value }))]} />
        <input id={id} className="pb-select-validity" aria-label={props.text} tabIndex={-1} value={option} onChange={() => {}} required={props.required} onInvalid={(event) => { event.preventDefault(); setInvalid(true); }} />
        {invalid && <small className="pb-field-error" role="alert">Обери варіант зі списку</small>}
      </> : <input {...common} type={props.fieldType === 'phone' ? 'tel' : props.fieldType} pattern={props.fieldType === 'phone' ? '[+0-9\\(\\) .\\-]{10,25}' : undefined} />}
    </>}
  </div>;
}

export function BlockRenderer({ root, device, selectedId, testing, onSelect, onDrop, products, campaignCode }: RendererProps) {
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const expire = () => setClosed(true);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Промокод скопійовано'); }
    catch { setNotice(`Скопіюй код вручну: ${value}`); }
  }
  function render(node: BlockNode, productId = 'titanium', inForm = false): ReactNode {
    const style = effectiveStyle(node, device);
    if (style.hidden && testing) return null;
    const container = isContainer(node);
    const ownsProduct = (node === root || node.type === 'product') && node.props.productExternalId;
    const productKey = ownsProduct ? node.props.productExternalId + ':' + node.props.modificationExternalId : productId;
    const offer = products?.find(item => item.productExternalId + ':' + (item.modificationExternalId || '') === productKey);
    const product = products ? { id: productKey, title: offer?.title || 'Оберіть товар у властивостях', variant: offer?.sku || '', badge: Number(offer?.oldPrice) > Number(offer?.price) ? 'Вигідна ціна' : '', price: Number(offer?.price || 0), oldPrice: Number(offer?.oldPrice || 0), tone: demoProducts[0].tone } : demoProducts.find((item) => item.id === (node.type === 'product' ? node.props.productId : productId)) || demoProducts[0];
    const css = blockCss(style, container);
    let body: ReactNode;
    const children = node.children.map((child) => render(child, product.id, inForm || node.type === 'form'));
    const binding = node.props.binding;
    const amount = (value: number) => value.toLocaleString('uk-UA') + (products ? ' ' + (offer?.currency === 'UAH' ? '₴' : offer?.currency || '') : ' ₴');
    const text = binding === 'product.title' ? product.title : binding === 'product.variant' ? product.variant : binding === 'product.badge' ? product.badge : binding === 'product.price' ? products && !offer?.price ? '' : amount(product.price) : binding === 'product.oldPrice' ? products && product.oldPrice <= product.price ? '' : amount(product.oldPrice) : node.props.text;
    const onAction = () => {
      if (!testing) return;
      if (node.props.action === 'close') setClosed(true);
      else if (node.props.action === 'copy') void copy(node.props.code);
      else if (node.props.action === 'product' || node.props.action === 'cart') setNotice(`${node.props.action === 'cart' ? 'Тест: додано до кошика' : 'Тест: відкрити товар'} — ${product.title}`);
      else if (node.props.action === 'link') setNotice(safeHref(node.props.href) ? `Тест: перехід на ${node.props.href}` : 'Задай посилання в налаштуваннях кнопки');
      else if (!inForm) setNotice('Кнопка відправлення має бути всередині форми');
    };
    if (node.type === 'text') body = <span className="pb-text" style={{ textDecoration: binding === 'product.oldPrice' ? 'line-through' : undefined }}>{text || (!testing && binding === 'none' ? 'Введи текст…' : '')}</span>;
    else if (node.type === 'image') body = <div className="pb-image" style={{ height: style.heightMode === 'auto' ? 180 : '100%' }}>{binding === 'product.image' ? products ? offer?.imageUrl ? <img src={offer.imageUrl} alt={node.props.alt || offer.title} draggable={false} style={{ objectFit: node.props.imageFit, objectPosition: node.props.imagePosition }} /> : <div className="pb-image-empty">Фото обраного товару</div> : <PhoneArtwork tone={product.tone} /> : /^https?:\/\//i.test(node.props.src) ? <img src={node.props.src} alt={node.props.alt} draggable={false} style={{ objectFit: node.props.imageFit, objectPosition: node.props.imagePosition }} /> : <div className="pb-image-empty"><Icon name="productCard" size={28} /><span>{node.props.alt || 'Додай зображення'}</span></div>}</div>;
    else if (node.type === 'button') body = <button type={testing && node.props.action === 'submit' && inForm ? 'submit' : 'button'} className="pb-action" tabIndex={testing ? 0 : -1} onClick={onAction}>{node.props.text || 'Кнопка'}</button>;
    else if (node.type === 'coupon') body = <div className="pb-coupon"><strong>{node.props.couponSource === 'campaign' ? campaignCode || 'Оберіть промокод кампанії' : node.props.code}</strong><button type="button" tabIndex={testing ? 0 : -1} onClick={() => testing && void copy(node.props.code)}><Icon name="copy" size={16} />{node.props.copyLabel}</button></div>;
    else if (node.type === 'countdown') body = <Countdown key={`${node.id}:${node.props.timerMode}:${node.props.durationMinutes}:${node.props.deadlineAt}`} node={node} testing={testing} onExpire={expire} />;
    else if (node.type === 'field') body = <FieldPreview node={node} testing={testing} />;
    else if (node.type === 'form') body = <FormPreview node={node} testing={testing} style={{ display: 'flex', flexDirection: style.direction, flexWrap: style.wrap ? 'wrap' : 'nowrap', columnGap: style.gap, rowGap: style.rowGap, justifyContent: style.justify, alignItems: style.align, width: '100%' }}>{children}</FormPreview>;
    else if (container) body = children.length ? children : !testing ? <div className="pb-empty-container"><Icon name="add" size={18} /><span>Додай або перетягни блок</span></div> : null;
    else body = !testing && node.type === 'spacer' ? <span className="pb-spacer-label">Відступ</span> : null;
    const handleDrop = (event: DragEvent) => {
      if (testing) return;
      event.preventDefault(); event.stopPropagation(); setDropTarget('');
      const source = event.dataTransfer.getData('application/mt-popup-block');
      if (source) onDrop(source, node.id, container ? 'inside' : 'after');
    };
    return <div key={node.id} data-block-id={node.id} data-block-type={node.type} data-hidden={style.hidden || undefined} data-label={node.name}
      className={`pb-node ${container ? 'is-container' : ''} ${!testing && selectedId === node.id ? 'is-selected' : ''} ${dropTarget === node.id ? 'is-drop-target' : ''}`}
      style={{ ...css, opacity: !testing && style.hidden ? 0.25 : css.opacity }}
      role={!testing ? 'button' : undefined} tabIndex={!testing ? 0 : undefined} aria-label={!testing ? `Редагувати блок: ${node.name}` : undefined}
      draggable={!testing && node.id !== root.id}
      onClick={!testing ? (event) => { event.stopPropagation(); onSelect(node.id); } : undefined}
      onKeyDown={!testing ? (event) => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onSelect(node.id); } } : undefined}
      onDragStart={!testing ? (event) => { event.stopPropagation(); event.dataTransfer.setData('application/mt-popup-block', node.id); event.dataTransfer.effectAllowed = 'move'; } : undefined}
      onDragOver={!testing ? (event) => { if (event.dataTransfer.types.includes('application/mt-popup-block')) { event.preventDefault(); event.stopPropagation(); setDropTarget(node.id); } } : undefined}
      onDragLeave={() => setDropTarget((id) => id === node.id ? '' : id)} onDrop={!testing ? handleDrop : undefined}
    >{body}</div>;
  }
  return <div className={`pb-artboard pp-sample-banner ${testing ? 'is-testing' : 'is-editing'}`} aria-label="Прев’ю блокового банера">
    {closed && testing ? <div className="pb-closed"><Icon name="check" size={24} /><p>Банер приховано</p><button type="button" onClick={() => setClosed(false)}>Показати знову</button></div> : render(root)}
    {notice && testing && <div className="pb-test-notice" role="status">{notice}<button type="button" aria-label="Закрити повідомлення" onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}
  </div>;
}
