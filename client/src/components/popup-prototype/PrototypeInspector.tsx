import { useId, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { StyledSelect } from '../StyledSelect';
import { demoProducts, fieldTypeLabels, isTextElement, moveItem, textElementLabels, type Device, type PrototypeDraft, type PrototypeField, type Selection, type TextStyle } from './model';
import { changeText, elementTextStyle, sampleProduct, textValue, textStyleDefaults } from './text-elements';

export function InspectorField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="pp-control"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Range({ label, value, min, max, onChange, unit = 'px', step = 1 }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; unit?: string; step?: number }) {
  const id = useId();
  return <label className="pp-range" htmlFor={id}><span>{label}<output aria-hidden="true">{value} {unit}</output></span><input id={id} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="pp-switch"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="pp-color"><span>{label}</span><div><input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /><code>{value.toUpperCase()}</code></div></label>;
}

interface InspectorProps {
  draft: PrototypeDraft;
  device: Device;
  selection: Selection;
  productIndex: number;
  onSelect: (value: Selection) => void;
  update: (change: (draft: PrototypeDraft) => PrototypeDraft) => void;
}

export const selectionLabels: Record<string, string> = {
  ...textElementLabels, productImage: 'Фото товару',
  banner: 'Композиція банера', copy: 'Заголовок і текст', products: 'Товари та картка', cta: 'Кнопка дії',
  fields: 'Поля форми', success: 'Повідомлення про успіх', coupon: 'Промокод', rules: 'Умови показу'
};

export function PrototypeInspector({ draft, device, selection, productIndex, onSelect, update }: InspectorProps) {
  const lead = draft.kind === 'lead-form';
  const fieldId = selection.startsWith('field:') ? selection.slice(6) : '';
  const field = draft.form.fields.find((item) => item.id === fieldId);
  const title = field ? field.label || 'Поле форми' : selectionLabels[selection] || 'Властивості';
  const productId = draft.product.ids[productIndex % draft.product.ids.length];
  const currentProduct = sampleProduct(draft, productId);
  const textElement = isTextElement(selection) ? selection : null;
  const typography = { ...textStyleDefaults(draft, device, selection), ...elementTextStyle(draft, device, selection) };
  const stylePatch = (value: TextStyle) => update((current) => ({ ...current, [device]: { ...current[device], textStyles: { ...current[device].textStyles, [selection]: { ...current[device].textStyles[selection], ...value } } } }));
  const patch = (value: Partial<PrototypeDraft>) => update((current) => ({ ...current, ...value }));
  const productPatch = (value: Partial<PrototypeDraft['product']>) => update((current) => ({ ...current, product: { ...current.product, ...value } }));
  const formPatch = (value: Partial<PrototypeDraft['form']>) => update((current) => ({ ...current, form: { ...current.form, ...value } }));
  const devicePatch = (value: Partial<PrototypeDraft['desktop']>) => update((current) => ({ ...current, [device]: { ...current[device], ...value } }));
  const fieldPatch = (value: Partial<PrototypeField>) => update((current) => ({ ...current, form: { ...current.form, fields: current.form.fields.map((item) => item.id === fieldId ? { ...item, ...value } : item) } }));

  function addField(type: PrototypeField['type']) {
    const id = `field-${crypto.randomUUID()}`;
    formPatch({ fields: [...draft.form.fields, { id, type, label: fieldTypeLabels[type], placeholder: '', required: false, width: 'full', options: type === 'select' ? 'Варіант 1\nВаріант 2' : '' }] });
    onSelect(`field:${id}`);
  }

  return <aside className="pp-inspector" aria-label="Властивості елемента">
    <header><div><small>ВЛАСТИВОСТІ</small><h2>{title}</h2></div><Icon name={field ? 'formBuilder' : 'tools'} size={20} /></header>
    <div className="pp-inspector-scroll">
      {textElement && <section><h3>Зміст елемента</h3>
        {['productTitle', 'productVariant', 'productBadge', 'price', 'oldPrice'].includes(textElement) && <p className="pp-hint">Поточний демотовар: {currentProduct.title}. Зміст зміниться лише для нього.</p>}
        <InspectorField label={textElementLabels[textElement]}>
          {textElement === 'price' || textElement === 'oldPrice' ? <input aria-label={textElementLabels[textElement]} type="number" min={0} max={9999999} step="0.01" value={textValue(draft, textElement, productId)} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 9999999) update((current) => changeText(current, textElement, String(value), productId)); }} /> : <textarea aria-label={textElementLabels[textElement]} rows={3} maxLength={textElement === 'code' ? 40 : textElement === 'copyLabel' ? 80 : ['eyebrow', 'productBadge'].includes(textElement) ? 120 : ['body', 'successBody', 'coverBody', 'footnote'].includes(textElement) ? 1000 : textElement === 'discount' ? 100 : 200} value={textValue(draft, textElement, productId)} onChange={(event) => update((current) => changeText(current, textElement, event.target.value, productId))} />}
        </InspectorField>
      </section>}

      {selection === 'productImage' && <section><h3>Зображення товару</h3>
        <p className="pp-hint">Поточний демотовар: {currentProduct.title}. Порожня адреса повертає ілюстрацію прикладу.</p>
        <InspectorField label="Адреса зображення" hint="Повна адреса http:// або https://"><input aria-label="Адреса зображення" type="url" maxLength={2000} value={currentProduct.imageUrl} onChange={(event) => update((current) => ({ ...current, product: { ...current.product, overrides: { ...current.product.overrides, [productId]: { ...current.product.overrides[productId], imageUrl: event.target.value } } } }))} /></InspectorField>
        <InspectorField label="Масштабування фото"><StyledSelect ariaLabel="Масштабування фото" value={draft.product.image.fit} onChange={(fit) => productPatch({ image: { ...draft.product.image, fit } })} options={[{ value: 'contain', label: 'Вмістити повністю' }, { value: 'cover', label: 'Заповнити область' }]} /></InspectorField>
        <Range label="Висота фото" min={80} max={400} value={draft[device].imageHeight ?? (device === 'mobile' ? 165 : draft.product.layout === 'card' ? 190 : draft.product.layout === 'compact' ? 138 : 220)} onChange={(imageHeight) => devicePatch({ imageHeight })} />
        <Range label="Заокруглення фото" min={0} max={40} value={draft.product.image.radius} onChange={(radius) => productPatch({ image: { ...draft.product.image, radius } })} />
        <Color label="Фон фото" value={draft.product.image.background || '#f7f6fc'} onChange={(background) => productPatch({ image: { ...draft.product.image, background } })} />
      </section>}

      {selection === 'banner' && <>
        <section><h3>Композиція</h3><div className="pp-layout-options">
          {lead ? (['split', 'simple'] as const).map((layout) => <button key={layout} type="button" aria-pressed={draft.form.layout === layout} onClick={() => formPatch({ layout })}><span className={`pp-layout-mini is-${layout}`}><i /><b /></span>{layout === 'split' ? 'З обкладинкою' : 'Лише форма'}</button>) : (['compact', 'wide', 'card'] as const).map((layout) => <button key={layout} type="button" aria-pressed={draft.product.layout === layout} onClick={() => productPatch({ layout })}><span className={`pp-layout-mini is-${layout}`}><i /><b /></span>{{ compact: 'Компактна', wide: 'Горизонтальна', card: 'Картка' }[layout]}</button>)}
        </div></section>
        <section><div className="pp-section-heading"><h3>Розміри та відступи</h3><span><Icon name={device === 'desktop' ? 'monitor' : 'phone'} size={13} />{device === 'desktop' ? 'Desktop' : 'Mobile'}</span></div>
          <Range label="Ширина банера" value={draft[device].width} min={280} max={device === 'mobile' ? 390 : 800} onChange={(width) => devicePatch({ width })} />
          <Range label="Внутрішні відступи" value={draft[device].padding} min={12} max={48} onChange={(padding) => devicePatch({ padding })} />
          <p className="pp-hint">Ці значення застосовуються лише до вибраного формату екрана.</p>
        </section>
      </>}

      {selection === 'copy' && <section><h3>Зміст повідомлення</h3>
        <InspectorField label="Надзаголовок"><input maxLength={120} value={draft.eyebrow} onChange={(event) => patch({ eyebrow: event.target.value })} /></InspectorField>
        <InspectorField label="Заголовок"><textarea rows={3} maxLength={200} value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></InspectorField>
        <InspectorField label="Основний текст"><textarea rows={4} maxLength={1000} value={draft.body} onChange={(event) => patch({ body: event.target.value })} /></InspectorField>
        <Range label={`Розмір заголовка · ${device === 'desktop' ? 'desktop' : 'mobile'}`} value={draft[device].titleSize} min={16} max={48} onChange={(titleSize) => devicePatch({ titleSize })} />
      </section>}

      {selection === 'products' && <>
        <section><h3>Добірка <span>{draft.product.ids.length} / 4</span></h3><p className="pp-hint">Демокаталог для перевірки конструктора.</p>
          <div className="pp-catalog-list">{demoProducts.map((product) => {
            const selected = draft.product.ids.includes(product.id);
            return <label key={product.id}><input type="checkbox" checked={selected} disabled={selected && draft.product.ids.length === 1} onChange={() => productPatch({ ids: selected ? draft.product.ids.filter((id) => id !== product.id) : [...draft.product.ids, product.id] })} /><i style={{ background: product.tone }} /><span><strong>{product.title}</strong><small>{product.variant}</small></span></label>;
          })}</div>
        </section>
        <section><h3>Порядок показу</h3><div className="pp-sort-list">{draft.product.ids.map((id, index) => <div key={id}><span><small>{String(index + 1).padStart(2, '0')}</small>{demoProducts.find((item) => item.id === id)?.title}</span><div><button type="button" aria-label={`Підняти товар ${index + 1}`} disabled={!index} onClick={() => productPatch({ ids: moveItem(draft.product.ids, index, -1) })}><Icon name="arrowUp" size={14} /></button><button type="button" aria-label={`Опустити товар ${index + 1}`} disabled={index === draft.product.ids.length - 1} onClick={() => productPatch({ ids: moveItem(draft.product.ids, index, 1) })}><Icon name="arrowDown" size={14} /></button></div></div>)}</div></section>
        <section><h3>Картка товару</h3><Switch label="Показувати стару ціну" checked={draft.product.showOldPrice} onChange={(showOldPrice) => productPatch({ showOldPrice })} /><Switch label="Показувати позначку" checked={draft.product.showBadge} onChange={(showBadge) => productPatch({ showBadge })} />
          <Range label="Автоматична ротація" value={draft.product.rotation} min={0} max={20} unit="с" onChange={(rotation) => productPatch({ rotation })} /><p className="pp-hint">0 — ручне перемикання. Автоперегортання працює в режимі «Тестувати».</p>
        </section>
      </>}

      {selection === 'fields' && <section><h3>Структура форми <span>{draft.form.fields.length} / 8</span></h3><p className="pp-hint">Вибери поле для детального налаштування. Порядок змінюється стрілками.</p>
        <div className="pp-sort-list">{draft.form.fields.map((item, index) => <div key={item.id}><button type="button" className="pp-field-link" onClick={() => onSelect(`field:${item.id}`)}>{item.label || 'Без назви'}</button><div><button type="button" disabled={!index} aria-label={`Підняти поле ${index + 1}`} onClick={() => formPatch({ fields: moveItem(draft.form.fields, index, -1) })}><Icon name="arrowUp" size={14} /></button><button type="button" disabled={index === draft.form.fields.length - 1} aria-label={`Опустити поле ${index + 1}`} onClick={() => formPatch({ fields: moveItem(draft.form.fields, index, 1) })}><Icon name="arrowDown" size={14} /></button></div></div>)}</div>
        <h3 className="pp-add-title">Додати поле</h3><div className="pp-field-types">{(Object.keys(fieldTypeLabels) as PrototypeField['type'][]).map((type) => <button type="button" key={type} disabled={draft.form.fields.length >= 8} onClick={() => addField(type)}><Icon name="add" size={15} />{fieldTypeLabels[type]}</button>)}</div>
      </section>}

      {field && <section><button className="pp-text-button" type="button" onClick={() => onSelect('fields')}><Icon name="arrowLeft" size={14} /> Усі поля</button>
        <InspectorField label="Тип поля"><StyledSelect ariaLabel="Тип поля" value={field.type} onChange={(type) => fieldPatch({ type })} options={(Object.keys(fieldTypeLabels) as PrototypeField['type'][]).map((value) => ({ value, label: fieldTypeLabels[value] }))} /></InspectorField>
        <InspectorField label="Назва поля"><input maxLength={120} value={field.label} onChange={(event) => fieldPatch({ label: event.target.value })} /></InspectorField>
        {field.type !== 'checkbox' && <InspectorField label="Підказка всередині"><input maxLength={160} value={field.placeholder} onChange={(event) => fieldPatch({ placeholder: event.target.value })} /></InspectorField>}
        {field.type === 'select' && <InspectorField label="Варіанти списку" hint="Кожен варіант — з нового рядка."><textarea rows={4} maxLength={1000} value={field.options} onChange={(event) => fieldPatch({ options: event.target.value })} /></InspectorField>}
        <Switch label="Обов’язкове поле" checked={field.required} onChange={(required) => fieldPatch({ required })} />
        <InspectorField label="Ширина поля" hint="На мобільному кожне поле займає весь рядок."><StyledSelect ariaLabel="Ширина поля" value={field.width} onChange={(width) => fieldPatch({ width })} options={[{ value: 'full', label: 'Увесь рядок' }, { value: 'half', label: 'Половина рядка' }]} /></InspectorField>
        <button className="pp-delete-field" type="button" disabled={draft.form.fields.length <= 1} onClick={() => { formPatch({ fields: draft.form.fields.filter((item) => item.id !== field.id) }); onSelect('fields'); }}><Icon name="delete" size={16} /> Видалити поле</button>
      </section>}

      {selection === 'cta' && <section><h3>{lead ? 'Отримання промокоду' : 'Дія покупця'}</h3>
        <InspectorField label="Текст кнопки"><input maxLength={80} value={draft.button} onChange={(event) => patch({ button: event.target.value })} /></InspectorField>
        {!lead && <InspectorField label="Дія кнопки"><StyledSelect ariaLabel="Дія кнопки" value={draft.product.action} onChange={(action) => productPatch({ action })} options={[{ value: 'product', label: 'Відкрити товар' }, { value: 'cart', label: 'Додати до кошика' }]} /></InspectorField>}
        <Range label="Заокруглення кнопки" value={draft.buttonRadius} min={0} max={30} onChange={(buttonRadius) => patch({ buttonRadius })} />
        <p className="pp-hint">У режимі «Тестувати» можна перевірити {lead ? 'введення даних і перехід до промокоду' : 'демонстраційну дію кнопки'}.</p>
      </section>}

      {selection === 'success' && <section><h3>Екран після відправлення</h3>
        <InspectorField label="Заголовок успіху"><input maxLength={200} value={draft.form.successTitle} onChange={(event) => formPatch({ successTitle: event.target.value })} /></InspectorField>
        <InspectorField label="Повідомлення успіху"><textarea rows={4} maxLength={1000} value={draft.form.successBody} onChange={(event) => formPatch({ successBody: event.target.value })} /></InspectorField>
      </section>}
      {selection === 'coupon' && <section><h3>Демонстраційна пропозиція</h3>
        <InspectorField label="Промокод"><input maxLength={40} value={draft.form.code} onChange={(event) => formPatch({ code: event.target.value })} /></InspectorField>
        <InspectorField label="Опис знижки"><input maxLength={100} value={draft.form.discount} onChange={(event) => formPatch({ discount: event.target.value })} /></InspectorField>
        <InspectorField label="Кнопка копіювання"><input maxLength={80} value={draft.form.copyLabel} onChange={(event) => formPatch({ copyLabel: event.target.value })} /></InspectorField>
        <p className="pp-hint">Це приклад для макета. Він не створює промокод у магазині.</p>
      </section>}
      {selection === 'rules' && <section><h3>Сценарій кампанії</h3>
        <InspectorField label="Сторінки показу"><StyledSelect ariaLabel="Сторінки показу" value={draft.rules.pages} onChange={(pages) => patch({ rules: { ...draft.rules, pages } })} options={[{ value: 'all', label: 'Усі сторінки' }, { value: 'products', label: 'Сторінки товарів' }]} /></InspectorField>
        <Range label="Затримка появи" value={draft.rules.delay} min={0} max={60} unit="с" onChange={(delay) => patch({ rules: { ...draft.rules, delay } })} />
        <InspectorField label="Повторний показ"><StyledSelect ariaLabel="Повторний показ" value={draft.rules.frequency} onChange={(frequency) => patch({ rules: { ...draft.rules, frequency } })} options={[{ value: 'session', label: 'Раз за сесію' }, { value: 'day', label: 'Раз на день' }]} /></InspectorField>
        <div className="pp-rule-summary"><Icon name="visibility" size={20} /><p>Показати через <b>{draft.rules.delay} с</b> на {draft.rules.pages === 'all' ? 'всіх сторінках' : 'сторінках товарів'}, {draft.rules.frequency === 'session' ? 'один раз за сесію' : 'один раз на день'}.</p></div>
        <p className="pp-hint">Правила зберігаються в макеті. На полотні банер показаний одразу для зручності редагування.</p>
      </section>}

      {(textElement || field || selection === 'cta') && <section><div className="pp-section-heading"><h3>Типографіка</h3><span>{device === 'desktop' ? 'Desktop' : 'Mobile'}</span></div>
        <Range label="Розмір тексту" min={8} max={96} value={typography.fontSize} onChange={(fontSize) => stylePatch({ fontSize })} />
        <InspectorField label="Насиченість"><StyledSelect ariaLabel="Насиченість" value={String(typography.fontWeight)} onChange={(weight) => stylePatch({ fontWeight: Number(weight) })} options={[300, 400, 500, 550, 600, 650, 700, 800].map((weight) => ({ value: String(weight), label: String(weight) }))} /></InspectorField>
        <Color label="Колір цього тексту" value={typography.color} onChange={(color) => stylePatch({ color })} />
        <Range label="Міжрядковий інтервал" min={1} max={2.5} step={0.01} unit="×" value={typography.lineHeight} onChange={(lineHeight) => stylePatch({ lineHeight })} />
        <Range label="Міжлітерний інтервал" min={-5} max={10} step={0.1} value={typography.letterSpacing} onChange={(letterSpacing) => stylePatch({ letterSpacing })} />
        <InspectorField label="Вирівнювання"><StyledSelect ariaLabel="Вирівнювання" value={typography.textAlign} onChange={(textAlign) => stylePatch({ textAlign })} options={[{ value: 'left', label: 'Ліворуч' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Праворуч' }]} /></InspectorField>
        <Switch label="Курсив" checked={typography.fontStyle === 'italic'} onChange={(italic) => stylePatch({ fontStyle: italic ? 'italic' : 'normal' })} />
        <button type="button" className="pp-text-button" onClick={() => update((current) => { const textStyles = { ...current[device].textStyles }; delete textStyles[selection]; return { ...current, [device]: { ...current[device], textStyles } }; })}>Скинути стиль елемента</button>
        <p className="pp-hint">Лише цей елемент у форматі {device === 'desktop' ? 'Desktop' : 'Mobile'}.{selection.startsWith('product') || selection === 'price' || selection === 'oldPrice' ? ' Стиль спільний для карток добірки.' : ''}</p>
      </section>}
      {['banner', 'copy', 'cta', 'success', 'coupon'].includes(selection) && <section><h3>Спільний стиль банера</h3>
        <Color label="Акцент і кнопки" value={draft.accent} onChange={(accent) => patch({ accent })} />
        <Color label="Фон" value={draft.background} onChange={(background) => patch({ background })} />
        <Color label="Колір тексту" value={draft.text} onChange={(text) => patch({ text })} />
        <Range label="Заокруглення банера" value={draft.radius} min={0} max={36} onChange={(radius) => patch({ radius })} />
        <div className="pp-palette" aria-label="Палітра банера">{['#6554c0', '#283b61', '#27766c', '#b65443', '#252438'].map((accent) => <button type="button" key={accent} aria-label={`Акцент ${accent}`} aria-pressed={draft.accent === accent} style={{ background: accent }} onClick={() => patch({ accent })} />)}</div>
      </section>}
    </div>
    <footer><Icon name="check" size={14} /> Зміни одразу видно на полотні</footer>
  </aside>;
}
