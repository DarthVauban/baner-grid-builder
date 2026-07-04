import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { copyToClipboard } from '../lib/banner-generator';
import { buildGlobalProductCode, buildProductsCode } from '../lib/product-generator';
import { useToast } from '../toast/ToastContext';

export function ProductSelectionPage() {
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [percent, setPercent] = useState(0);
  const [fixed, setFixed] = useState(0);
  const [description, setDescription] = useState('');
  const { showToast } = useToast();
  const code = useMemo(() => buildProductsCode({ imageUrl, linkUrl, alt, oldPricePercent: percent, oldPriceFixed: fixed, shareDescription: description }), [imageUrl, linkUrl, alt, percent, fixed, description]);
  const globalCode = useMemo(buildGlobalProductCode, []);

  async function copy(text: string, success: string) {
    try { await copyToClipboard(text); showToast(success); }
    catch { showToast('Не вдалося скопіювати код.', 'error'); }
  }

  return (
    <div className="tool-page">
      <header className="page-heading">
        <p className="eyebrow">Окремий код</p>
        <h1>Вибірка товарів</h1>
        <p>Додайте банер над супутніми товарами, налаштуйте стару ціну та скопіюйте код у режим «Джерело» Хорошопу.</p>
      </header>
      <section className="tool-panel product-settings">
        <header className="tool-panel__header"><div><p className="eyebrow">Налаштування</p><h2>Банер і ціни</h2></div></header>
        <div className="product-settings__grid">
          <label className="field"><span>Посилання на зображення банера</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://example.com/image.jpg" /></label>
          <label className="field"><span>Посилання банера</span><input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.com/sale" /></label>
          <label className="field"><span>Alt-текст</span><input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Опис зображення" /></label>
          <label className="field"><span>Стара ціна: відсоток</span><input type="number" min="0" step="0.1" value={percent || ''} onChange={(event) => { setPercent(Number(event.target.value)); if (event.target.value) setFixed(0); }} placeholder="20" /></label>
          <label className="field"><span>Стара ціна: фіксована надбавка</span><input type="number" min="0" step="0.01" value={fixed || ''} onChange={(event) => { setFixed(Number(event.target.value)); if (event.target.value) setPercent(0); }} placeholder="500" /></label>
          <label className="field product-settings__wide"><span>Опис для поширення посилання</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label>
        </div>
      </section>
      <section className="tool-panel code-panel">
        <header className="tool-panel__header"><div><p className="eyebrow">Код сторінки</p><h2>Вибірка товарів</h2></div><button className="button button--primary" onClick={() => void copy(code, 'Код вибірки товарів скопійовано.')}><Icon name="copy" size={17} /> Копіювати код</button></header>
        <textarea className="code-output code-output--large" value={code} readOnly spellCheck={false} />
      </section>
      <section className="tool-panel code-panel">
        <header className="tool-panel__header"><div><p className="eyebrow">Глобальний код</p><h2>Стара ціна на сторінці товару</h2><p>Цей фрагмент потрібно встановити один раз у глобальний шаблон.</p></div><button className="button button--primary" onClick={() => void copy(globalCode, 'Глобальний код скопійовано.')}><Icon name="copy" size={17} /> Копіювати глобальний код</button></header>
        <textarea className="code-output" value={globalCode} readOnly spellCheck={false} />
      </section>
    </div>
  );
}
