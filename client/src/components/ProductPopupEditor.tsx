import { useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { PopupToggle } from './PopupToggle';
import { StyledSelect } from './StyledSelect';
import { defaultProductPopupConfig, productPopupElementLabels } from '../lib/popup-product';
import type { MediaAsset } from '../types/media';
import type { PopupCampaignInput, PopupProductConfig, PopupProductElement, PopupProductElementStyle, PopupPromoProduct } from '../types/popup-banner';
import '../styles/media-library.css';

type ImageSurface = 'desktop' | 'mobile';

interface Props {
  input: PopupCampaignInput;
  product?: PopupPromoProduct;
  onChange: (patch: Partial<PopupCampaignInput>) => void;
  onChooseProduct: () => void;
  onUpload: (file: File) => Promise<MediaAsset>;
  onImageUploaded: (asset: MediaAsset, surface: ImageSurface) => void;
  uploading: boolean;
}

function ImageUpload({ surface, url, width, height, disabled, busy, onFile }: {
  surface: ImageSurface; url: string; width: number; height: number;
  disabled: boolean; busy: boolean; onFile: (file: File | undefined) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const mobile = surface === 'mobile';
  const title = mobile ? 'Зображення банера для телефона' : 'Зображення банера для desktop';
  return <div className="product-popup-upload">
    <strong id={`${id}-label`}>{title}</strong>
    <p id={`${id}-hint`}>{mobile ? 'Рекомендований розмір: 1000 × 1000 px (1:1)' : 'Рекомендований розмір: 880 × 1000 px (22:25)'}</p>
    <section className={`media-upload-zone${dragActive ? ' media-upload-zone--active' : ''}`} aria-busy={busy}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
      onDrop={(event) => { event.preventDefault(); setDragActive(false); if (!disabled) onFile(event.dataTransfer.files[0]); }}>
      {url ? <img src={url} alt={mobile ? 'Мобільне зображення банера' : 'Desktop-зображення банера'} /> : <span className="media-upload-zone__icon"><Icon name="upload" size={27} /></span>}
      <div><strong>Перетягніть зображення сюди</strong><small>JPG, PNG або WebP, до 10 МБ.</small>
        {width > 0 && <small>Завантажено: {width} × {height} px</small>}
        {busy && <small role="status">Завантажуємо зображення…</small>}
      </div>
      <button className="button button--primary" type="button" disabled={disabled} onClick={() => input.current?.click()} aria-label={`${url ? 'Замінити' : 'Вибрати'} ${mobile ? 'мобільне' : 'desktop'} зображення`}>
        <Icon name="upload" size={18} /> {url ? 'Замінити файл' : 'Вибрати файл'}
      </button>
      <input ref={input} className="media-upload-input" type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} disabled={disabled}
        onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
    </section>
    {mobile && <small>На телефоні зображення відображається квадратним, із кадруванням по центру. Якщо файл не завантажено, використовується desktop-зображення.</small>}
  </div>;
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="product-popup-color"><span>{label}</span><div>
    <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label}: вибрати колір`} />
    <input key={value} defaultValue={value} maxLength={7} onBlur={(event) => { if (/^#[0-9a-f]{6}$/iu.test(event.target.value)) onChange(event.target.value); else event.target.value = value; }} aria-label={`${label}: HEX`} />
  </div></label>;
}

export function ProductPopupEditor({ input, product, onChange, onChooseProduct, onUpload, onImageUploaded, uploading }: Props) {
  const config = input.productPopup || defaultProductPopupConfig();
  const [element, setElement] = useState<PopupProductElement>('heading');
  const [uploadError, setUploadError] = useState('');
  const [uploadSurface, setUploadSurface] = useState<ImageSurface | null>(null);
  const patch = (value: Partial<PopupProductConfig>) => onChange({ productPopup: { ...config, ...value } });
  const content = (value: Partial<PopupCampaignInput['content']>) => onChange({ content: { ...input.content, ...value } });
  const style = config.elements[element];
  const patchStyle = (value: Partial<PopupProductElementStyle>) => patch({ elements: { ...config.elements, [element]: { ...style, ...value } } });
  const amount = [product?.price, product?.currency].filter(Boolean).join(' ');
  const numeric = (value: string | undefined) => Number((value || '').replace(/\s/gu, '').replace(',', '.'));
  const manualInvalid = (config.showOldPrice || config.showSavings) && config.oldPriceSource === 'manual'
    && !(numeric(config.manualOldPrice) > numeric(product?.price));

  async function upload(file: File | undefined, surface: ImageSurface) {
    if (!file) return;
    setUploadError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setUploadError('Оберіть JPG, PNG або WebP розміром до 10 МБ.'); return;
    }
    setUploadSurface(surface);
    try {
      const asset = await onUpload(file);
      onImageUploaded(asset, surface);
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Не вдалося завантажити зображення.'); }
    finally { setUploadSurface(null); }
  }

  return <>
    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="productCard" size={22} /><div><h2>Товар із каталогу</h2><p>Назва за замовчуванням, актуальна ціна та посилання надходять із каталогу Хорошопа.</p></div></div>
      <div className="product-popup-catalog-summary"><div><strong>{product?.title || 'Товар ще не вибрано'}</strong><span>{amount || 'Оберіть товар, щоб побачити ціну'}</span></div><button className="button button--secondary button--small" type="button" onClick={onChooseProduct}>{product ? 'Змінити товар' : 'Обрати товар'}</button></div>
      <label><span>Назва товару на банері <i>необов’язково</i></span><input value={config.titleOverride} placeholder={product?.title || 'Назва з каталогу'} maxLength={240} onChange={(event) => patch({ titleOverride: event.target.value })} /><small>Власна назва діє лише на цьому банері. Порожнє поле використовує назву з каталогу.</small></label>
      <label><span>Посилання «Детальніше» з каталогу</span><input readOnly value={product?.pageUrl || ''} placeholder="З’явиться після вибору товару" /></label>
    </section>

    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="edit" size={22} /><div><h2>Текст і зображення</h2><p>На desktop зображення розташоване ліворуч, а на телефоні — над пропозицією.</p></div></div>
      <div className="popup-form-grid">
        <label><span>Спеціальна пропозиція</span><input value={input.content.eyebrow} maxLength={120} onChange={(event) => content({ eyebrow: event.target.value })} /></label>
        <label className="is-full"><span>Головний заголовок</span><textarea rows={2} value={input.content.title} maxLength={240} onChange={(event) => content({ title: event.target.value })} /></label>
      </div>
      <ImageUpload surface="desktop" url={input.content.imageUrl} width={config.imageWidth} height={config.imageHeight} disabled={uploading} busy={uploadSurface === 'desktop'} onFile={(file) => void upload(file, 'desktop')} />
      <ImageUpload surface="mobile" url={config.mobileImageUrl} width={config.mobileImageWidth} height={config.mobileImageHeight} disabled={uploading} busy={uploadSurface === 'mobile'} onFile={(file) => void upload(file, 'mobile')} />
      {uploadError && <p className="product-popup-error" role="alert">{uploadError}</p>}
    </section>

    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="publication" size={22} /><div><h2>Ціни та вигода</h2><p>Актуальна ціна завжди береться з каталогу: {amount || 'товар ще не вибрано'}.</p></div></div>
      <PopupToggle label="Показувати стару ціну" role="switch" checked={config.showOldPrice} onChange={(showOldPrice) => patch({ showOldPrice })} />
      <PopupToggle label="Показувати лейбл вигоди" role="switch" checked={config.showSavings} onChange={(showSavings) => patch({ showSavings })} />
      {(config.showOldPrice || config.showSavings) && <div className="popup-form-grid">
        <label><span>Джерело старої ціни</span><StyledSelect ariaLabel="Джерело старої ціни" value={config.oldPriceSource} options={[{ value: 'catalog', label: 'Автоматично з каталогу' }, { value: 'manual', label: 'Встановити вручну' }]} onChange={(oldPriceSource) => patch({ oldPriceSource })} /></label>
        {config.oldPriceSource === 'manual'
          ? <label><span>Стара ціна</span><input type="number" aria-label="Стара ціна" min={0.01} step={0.01} value={config.manualOldPrice} onChange={(event) => patch({ manualOldPrice: event.target.value })} /><small>{product?.currency || 'У валюті вибраного товару'}</small></label>
          : <label><span>Стара ціна з каталогу</span><input readOnly value={product?.oldPrice || ''} placeholder="У каталозі не вказано" /></label>}
        {config.showSavings && <label className="is-full"><span>Текст лейбла вигоди</span><input value={config.savingsLabel} maxLength={60} onChange={(event) => patch({ savingsLabel: event.target.value })} /><small>Сума обчислюється як різниця між старою та актуальною ціною. За відсутності додатної різниці лейбл і стара ціна приховані.</small></label>}
      </div>}
      {manualInvalid && <p className="product-popup-error">Вкажіть стару ціну, вищу за актуальну ціну товару.</p>}
    </section>

    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="link" size={22} /><div><h2>Кнопки банера</h2><p>Покупка використовує нативний кошик Хорошопа. «Детальніше» відкриває товар із каталогу.</p></div></div>
      <div className="popup-form-grid">
        <label><span>Кнопка покупки</span><input value={input.content.primaryLabel} maxLength={120} onChange={(event) => content({ primaryLabel: event.target.value })} /></label>
        <label><span>Кнопка «Детальніше»</span><input value={input.content.secondaryLabel} maxLength={120} onChange={(event) => content({ secondaryLabel: event.target.value })} /></label>
      </div>
    </section>

    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="edit" size={22} /><div><h2>Стилі елементів</h2><p>Налаштуйте кожен текст, ціну, лейбл і кнопку окремо.</p></div></div>
      <label><span>Елемент банера</span><StyledSelect ariaLabel="Елемент банера" value={element} options={Object.entries(productPopupElementLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setElement(value as PopupProductElement)} /></label>
      <div className="popup-form-grid">
        <Color label="Колір елемента" value={style.color} onChange={(color) => patchStyle({ color })} />
        <Color label="Фон елемента" value={style.backgroundColor} onChange={(backgroundColor) => patchStyle({ backgroundColor })} />
        <label><span>Непрозорість фону, %</span><input type="number" min={0} max={100} value={style.backgroundOpacity} onChange={(event) => patchStyle({ backgroundOpacity: Number(event.target.value) })} /></label>
        <label><span>Розмір шрифту, px</span><input type="number" min={8} max={72} value={style.fontSize} onChange={(event) => patchStyle({ fontSize: Number(event.target.value) })} /></label>
        <label><span>Розмір шрифту на телефоні, px</span><input type="number" min={8} max={72} value={style.fontSizeMobile} onChange={(event) => patchStyle({ fontSizeMobile: Number(event.target.value) })} /></label>
        <label><span>Шрифт</span><StyledSelect ariaLabel="Шрифт елемента" value={style.fontFamily} options={['Inter', 'Arial', 'Georgia', 'system-ui'].map((value) => ({ value, label: value }))} onChange={(fontFamily) => patchStyle({ fontFamily: fontFamily as PopupProductElementStyle['fontFamily'] })} /></label>
        <label><span>Насиченість</span><StyledSelect ariaLabel="Насиченість елемента" value={String(style.fontWeight)} options={[400, 500, 600, 700, 800, 900].map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => patchStyle({ fontWeight: Number(value) })} /></label>
        <label><span>Вирівнювання</span><StyledSelect ariaLabel="Вирівнювання елемента" value={style.textAlign} options={[{ value: 'left', label: 'Ліворуч' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Праворуч' }]} onChange={(textAlign) => patchStyle({ textAlign })} /></label>
        <Color label="Колір рамки елемента" value={style.borderColor} onChange={(borderColor) => patchStyle({ borderColor })} />
        {([
          ['borderWidth', 'Товщина рамки, px', 6], ['borderRadius', 'Заокруглення елемента, px', 40],
          ['paddingX', 'Горизонтальний відступ, px', 40], ['paddingY', 'Вертикальний відступ, px', 32]
        ] as const).map(([key, label, max]) => <label key={key}><span>{label}</span><input type="number" min={0} max={max} value={style[key]} onChange={(event) => patchStyle({ [key]: Number(event.target.value) })} /></label>)}
      </div>
    </section>

    <section className="popup-form-section">
      <div className="product-popup-section-title"><Icon name="popup" size={22} /><div><h2>Вікно та підкладка</h2><p>Зображення зберігає підготовлений вами дизайн.</p></div></div>
      <div className="popup-form-grid">
        <Color label="Фон попапа" value={input.styles.backgroundColor} onChange={(backgroundColor) => onChange({ styles: { ...input.styles, backgroundColor } })} />
        <Color label="Колір затемнення" value={config.overlayColor} onChange={(overlayColor) => patch({ overlayColor })} />
        <label><span>Непрозорість затемнення, %</span><input type="number" min={0} max={90} value={config.overlayOpacity} onChange={(event) => patch({ overlayOpacity: Number(event.target.value) })} /></label>
        <Color label="Колір рамки попапа" value={config.borderColor} onChange={(borderColor) => patch({ borderColor })} />
        <label><span>Ширина попапа, px</span><input type="number" min={640} max={1200} step={10} value={input.styles.maxWidth} onChange={(event) => onChange({ styles: { ...input.styles, maxWidth: Number(event.target.value) } })} /></label>
        <label><span>Заокруглення попапа, px</span><input type="number" min={0} max={40} value={input.styles.borderRadius} onChange={(event) => onChange({ styles: { ...input.styles, borderRadius: Number(event.target.value) } })} /></label>
        <label><span>Товщина рамки попапа, px</span><input type="number" min={0} max={6} value={config.borderWidth} onChange={(event) => patch({ borderWidth: Number(event.target.value) })} /></label>
        <label><span>Відступ контенту, px</span><input type="number" min={12} max={64} value={config.contentPadding} onChange={(event) => patch({ contentPadding: Number(event.target.value) })} /></label>
        <label><span>Відступ контенту на телефоні, px</span><input type="number" min={8} max={40} value={config.contentPaddingMobile} onChange={(event) => patch({ contentPaddingMobile: Number(event.target.value) })} /></label>
        <label><span>Проміжок на телефоні, px</span><input type="number" min={4} max={32} value={config.contentGapMobile} onChange={(event) => patch({ contentGapMobile: Number(event.target.value) })} /></label>
        <label><span>Проміжок між елементами, px</span><input type="number" min={4} max={40} value={config.contentGap} onChange={(event) => patch({ contentGap: Number(event.target.value) })} /></label>
      </div>
    </section>
  </>;
}
