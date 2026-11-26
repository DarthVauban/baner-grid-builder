import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import { horoshopAvailability } from '../lib/horoshop-availability';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useToast } from '../toast/ToastContext';
import { HoroshopProductSearchDialog } from '../components/HoroshopProductSearchDialog';
import { Icon } from '../components/Icon';
import { ProductPricingFields } from '../components/ProductPricingFields';
import { StyledSelect } from '../components/StyledSelect';
import type { ProductPricing } from '../types/product-selection';
import type { CampaignMatch, CampaignResolution, CampaignSection, CampaignSummary } from '../types/thematic-campaign';
import '../styles/thematic-campaigns.css';

const defaultPricing: ProductPricing = { priceMode: 'none', priceValue: 0, highlightPromoPrice: false };

function addMatches(sections: CampaignSection[], matches: CampaignMatch[]) {
  const updated = sections.map((section) => ({ ...section, products: [...section.products] }));
  const seen = new Set(updated.flatMap((section) => section.products.map((product) => product.id)));
  const categories = new Map(updated.flatMap((section) => section.categories.map((key) => [key, section] as const)));
  let added = 0;
  for (const product of matches) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    let section = categories.get(product.category);
    if (!section) {
      section = { id: crypto.randomUUID(), name: product.categoryName, categories: [product.category], products: [] };
      categories.set(product.category, section);
      updated.push(section);
    }
    section.products.push(product);
    added += 1;
  }
  return { sections: updated, added };
}

function SectionEditor({ section, sections, update, move, merge, remove }: {
  section: CampaignSection; sections: CampaignSection[]; update: (name: string) => void; move: (step: number) => void;
  merge: (id: string) => void; remove: (id: string) => void;
}) {
  const [limit, setLimit] = useState(24);
  const [open, setOpen] = useState(false);
  const index = sections.indexOf(section);
  return <div className="campaign-section">
    <div className="campaign-section__head">
      <input aria-label="Назва розділу" value={section.name} maxLength={200} onChange={(event) => update(event.target.value)} />
      <button type="button" className="button button--secondary button--small" aria-expanded={open} onClick={() => setOpen(!open)}>Товари ({section.products.length})</button>
      <button type="button" className="icon-button" aria-label={`Підняти ${section.name}`} disabled={index === 0} onClick={() => move(-1)}>↑</button>
      <button type="button" className="icon-button" aria-label={`Опустити ${section.name}`} disabled={index === sections.length - 1} onClick={() => move(1)}>↓</button>
    </div>
    {open && <div className="campaign-section__products">
      {sections.length > 1 && <StyledSelect ariaLabel="Об’єднати товари з розділом" placeholder="Об’єднати з іншим розділом"
        value="" searchable options={sections.filter((other) => other.id !== section.id).map((other) => ({ value: other.id, label: other.name }))} onChange={merge} />}
      <ul className="campaign-products">{section.products.slice(0, limit).map((product) => {
        const availability = product.inactive
          ? { label: 'Відсутній у каталозі', tone: 'unavailable' }
          : horoshopAvailability(product.availability);
        return <li className="campaign-product" key={product.id}>
          <div className="campaign-product__details">
            <strong>{product.title}</strong>
            <div className="campaign-product__meta">
              <small>{product.sku}</small>
              <span className={`horoshop-badge horoshop-badge--${availability.tone}`}><i aria-hidden="true" />{availability.label}</span>
            </div>
          </div>
          <button className="button button--small button--danger" aria-label={`Прибрати ${product.title} з акції`} type="button" onClick={() => remove(product.id)}>
            <Icon name="delete" size={16} />Прибрати
          </button>
        </li>;
      })}</ul>
      {section.products.length > limit && <button className="button button--secondary button--small" onClick={() => setLimit(limit + 24)}>Показати ще</button>}
    </div>}
  </div>;
}

export default function ThematicCampaignsPage() {
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const apiClient = api.thematicCampaigns;
  const library = useQuery({ queryKey: ['thematic-campaigns'], queryFn: ({ signal }) => apiClient.list(signal) });
  const [saved, setSaved] = useState<CampaignSummary | null>(null);
  const [name, setName] = useState('');
  const [pricing, setPricing] = useState(defaultPricing);
  const [sections, setSections] = useState<CampaignSection[]>([]);
  const [generation, setGeneration] = useState('');
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Pick<CampaignResolution, 'unmatched' | 'ambiguous' | 'duplicates'> & { added: number } | null>(null);
  const total = sections.reduce((sum, group) => sum + group.products.length, 0);
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const code = saved ? `<script async src="${window.location.origin}/api/public/thematic-campaigns/${saved.publicId}/embed.js"></script>` : '';

  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося виконати операцію.'); }
    finally { setBusy(false); }
  }
  function changeSections(next: CampaignSection[]) { setSections(next); setDirty(true); }
  function reset() {
    setSaved(null); setName(''); setPricing(defaultPricing); setSections([]); setGeneration(''); setReport(null); setText(''); setDirty(false);
  }
  async function open(id?: string) {
    if (dirty && !await confirm({ title: 'Відкрити іншу акцію?', message: 'Поточні зміни ще не збережено.', confirmLabel: 'Продовжити' })) return;
    await run(async () => {
      if (!id) { reset(); return; }
      const record = await apiClient.get(id);
      reset(); setSaved(record); setName(record.name); setSections(record.sections); setGeneration(record.generation);
      setPricing(record.pricing ?? defaultPricing);
    });
  }
  async function resolveList() {
    await run(async () => {
      const result = await apiClient.resolve(lines);
      if (generation && generation !== result.generation) throw new Error('Підключення Хорошопа змінилося. Створіть нову акцію для цього каталогу.');
      const next = addMatches(sections, result.matched);
      if (next.added) changeSections(next.sections);
      setGeneration(result.generation);
      setReport({ added: next.added, duplicates: result.duplicates + result.matched.length - next.added,
        unmatched: result.unmatched, ambiguous: result.ambiguous });
      setDialog(false); setText('');
    });
  }
  function choose(input: string, product: CampaignMatch) {
    if (!report) return;
    const next = addMatches(sections, [product]);
    if (next.added) changeSections(next.sections);
    setReport({ ...report, added: report.added + next.added, duplicates: report.duplicates + 1 - next.added,
      ambiguous: report.ambiguous.filter((item) => item.input !== input) });
  }
  async function save() {
    await run(async () => {
      const input = {
        name: name.trim(), generation,
        pricing: { ...pricing, priceValue: pricing.priceMode === 'none' ? 0 : pricing.priceValue },
        sections: sections.map((section) => ({
          id: section.id, name: section.name.trim(), categories: section.categories, productIds: section.products.map((product) => product.id)
        }))
      };
      const result = saved ? await apiClient.update(saved.id, input, saved.revision) : await apiClient.create(input);
      setSaved(result); setName(result.name); setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['thematic-campaigns'] });
      showToast('Акцію збережено.');
    });
  }
  async function removeCampaign() {
    if (!saved || !await confirm({ title: 'Видалити акцію?', message: 'Код цієї акції перестане показувати товари на вітрині.', confirmLabel: 'Видалити', tone: 'danger' })) return;
    await run(async () => {
      await apiClient.remove(saved.id, saved.revision);
      reset(); await queryClient.invalidateQueries({ queryKey: ['thematic-campaigns'] });
    });
  }
  return <main className="campaign-page">
    <header className="page-heading"><h1>Тематичні акції</h1><p>Зберіть товари Хорошопа в акційну добірку з навігацією за категоріями.</p></header>
    {error && !dialog && <p role="alert" className="campaign-error">{error}</p>}
    <fieldset disabled={busy} className="campaign-layout">
      <aside className="campaign-panel campaign-library"><h2>Мої акції</h2>
        <button className="button button--secondary" onClick={() => void open()}><Icon name="add" size={16} />Нова акція</button>
        {library.isLoading && <p role="status">Завантажуємо акції…</p>}
        {library.isError && <button className="button button--secondary" onClick={() => void library.refetch()}>Повторити завантаження</button>}
        {library.data?.length === 0 && <p>Збережені акції з’являться тут.</p>}
        {library.data?.map((item) => <button key={item.id} className="campaign-library__item" aria-current={item.id === saved?.id} onClick={() => void open(item.id)}>{item.name}</button>)}
      </aside>
      <div className="campaign-main">
        <section className="campaign-panel">
          <label className="campaign-name">Назва акції<input placeholder="Наприклад, Чорна п’ятниця" maxLength={160} value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} /></label>
          <section className="campaign-pricing" aria-labelledby="campaign-pricing-heading">
            <h2 id="campaign-pricing-heading">Косметична стара ціна</h2>
            <p>Надбавка визначає перекреслену ціну. Ціну для оплати визначає кошик Хорошопа.</p>
            <div className="campaign-pricing__fields">
              <ProductPricingFields pricing={pricing} onChange={(patch) => {
                setPricing((current) => ({ ...current, ...patch }));
                setDirty(true);
              }} />
            </div>
            {pricing.priceMode !== 'none' && <p>Для показу старої ціни на сторінці товару потрібен спільний код віджетів Хорошопа.</p>}
          </section>
          <div className="campaign-bar"><h2>Склад акції <small>{total.toLocaleString('uk-UA')}</small></h2>
            <button className="button button--secondary" onClick={() => { setError(''); setDialog(true); }}><Icon name="add" size={16} />Вставити список</button></div>
          {!total && <p>Вставте назви чи артикули товарів. Розділи сформуються з категорій каталогу.</p>}
          {report && <div className="campaign-report" aria-live="polite">
            <strong>Додано товарів: {report.added} · Повторів: {report.duplicates}</strong>
            {!!report.unmatched.length && <details><summary>Не знайдено ({report.unmatched.length})</summary><ul>{report.unmatched.map((item) => <li key={item}>{item}</li>)}</ul></details>}
            {report.ambiguous.map((item) => <div key={item.input}>Уточніть «{item.input}» <StyledSelect value="" searchable
              ariaLabel={`Уточніть «${item.input}»`} placeholder="Оберіть товар" options={item.candidates.map((one) => ({ value: one.id, label: `${one.title} · ${one.sku}` }))}
              onChange={(id) => {
              const candidate = item.candidates.find((one) => one.id === id);
              if (candidate) choose(item.input, candidate);
            }} /></div>)}
          </div>}
          {sections.map((section, index) => <SectionEditor key={section.id} section={section} sections={sections}
            update={(value) => changeSections(sections.map((item) => item === section ? { ...item, name: value } : item))}
            move={(step) => { const next = [...sections]; next.splice(index, 1); next.splice(index + step, 0, section); changeSections(next); }}
            merge={(id) => changeSections(sections.filter((item) => item !== section).map((item) => item.id !== id ? item : {
              ...item, products: [...item.products, ...section.products], categories: [...item.categories, ...section.categories]
            }))}
            remove={(id) => changeSections(sections.map((item) => item === section ? { ...item, products: item.products.filter((product) => product.id !== id) } : item).filter((item) => item.products.length))} />)}
          <footer className="campaign-actions"><button className="button button--primary" disabled={!name.trim() || !total || !dirty || sections.some((group) => !group.name.trim())} onClick={() => void save()}><Icon name="save" size={16} />Зберегти акцію</button>
            {saved && <button className="button button--secondary" onClick={() => void removeCampaign()}>Видалити</button>}</footer>
        </section>
        {saved && <section className="campaign-panel"><h2>Код для Хорошопа</h2>
          <p>Вставте код у режимі «Джерело» на сторінці акції. Збережені зміни з’являтимуться за тим самим кодом.</p>
          <textarea aria-label="Код для Хорошопа" value={code} readOnly rows={3} />
          <button className="button button--secondary" onClick={() => void run(async () => { await copyToClipboard(code); showToast('Код скопійовано.'); })}><Icon name="copy" size={16} />Копіювати код</button>
        </section>}
      </div>
    </fieldset>
    {dialog && <HoroshopProductSearchDialog title="Додати товари до акції" description="Вставте назви або артикули по одному на рядок. Повторні збіги об’єднаються."
      value={text} onValueChange={setText} placeholder={'Назва товару\nАртикул'} countMessage={`Рядків: ${lines.length.toLocaleString('uk-UA')} із 20 000`}
      confirmLabel="Додати до акції" confirmDisabled={!lines.length || lines.length > 20000} busy={busy} errorMessage={error}
      onClose={() => { setDialog(false); setError(''); }} onConfirm={() => void resolveList()} />}
  </main>;
}
