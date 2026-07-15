import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { catalogConditionOptions } from '../lib/catalog';
import type { CatalogAvailabilityStatus, CatalogCondition, CatalogProduct } from '../types/catalog';

type PublicForm = Awaited<ReturnType<typeof api.storefront.form>>;
type PublicField = PublicForm['fields'][number];

const availabilityOptions: Array<{ value: CatalogAvailabilityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Уся наявність' },
  { value: 'in_stock', label: 'В наявності' },
  { value: 'incoming', label: 'В дорозі' },
  { value: 'unavailable', label: 'Немає' }
];
const conditionOptions = [{ value: 'all', label: 'Усі' }, ...catalogConditionOptions];
const sortOptions = [
  { value: 'updated_desc', label: 'Нові оновлення' },
  { value: 'name_asc', label: 'Назва А-Я' },
  { value: 'price_asc', label: 'Дешевші спочатку' },
  { value: 'price_desc', label: 'Дорожчі спочатку' }
];

function ProductImage({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.mainImageUrl]);
  return <span className="storefront-product-image">
    {product.mainImageUrl && !failed
      ? <img src={product.mainImageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} />
      : <Icon name="phone" size={34} />}
  </span>;
}

function fieldValue(values: Record<string, unknown>, field: PublicField) {
  const value = values[field.key];
  if (field.type === 'checkbox') return Array.isArray(value) ? value.map(String) : [];
  return value == null ? '' : String(value);
}

function PublicFieldControl({
  field,
  values,
  onChange
}: {
  field: PublicField;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (field.type === 'textarea') {
    return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><textarea required={field.required} placeholder={field.placeholder} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)} /></label>;
  }
  if (field.type === 'select' || field.systemFieldType === 'bank') {
    return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><select required={field.required} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)}>
      <option value="">Оберіть</option>
      {field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select></label>;
  }
  if (field.type === 'radio') {
    return <fieldset className="storefront-choice"><legend>{field.label}{field.required ? ' *' : ''}</legend>{field.options.map((option) => <label key={option.value}><input type="radio" name={field.key} required={field.required} checked={fieldValue(values, field) === option.value} onChange={() => onChange(field.key, option.value)} /> {option.label}</label>)}</fieldset>;
  }
  if (field.type === 'checkbox') {
    const current = new Set(fieldValue(values, field) as string[]);
    return <fieldset className="storefront-choice"><legend>{field.label}{field.required ? ' *' : ''}</legend>{field.options.map((option) => <label key={option.value}><input type="checkbox" checked={current.has(option.value)} onChange={(event) => {
      const next = new Set(current);
      if (event.target.checked) next.add(option.value);
      else next.delete(option.value);
      onChange(field.key, [...next]);
    }} /> {option.label}</label>)}</fieldset>;
  }
  const inputType = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text';
  return <label className="field storefront-form__field"><span>{field.label}{field.required ? ' *' : ''}</span><input type={inputType} required={field.required} placeholder={field.placeholder} value={String(fieldValue(values, field))} onChange={(event) => onChange(field.key, event.target.value)} /></label>;
}

function StorefrontApplicationForm({
  product,
  form
}: {
  product: CatalogProduct;
  form: PublicForm | undefined;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<{ number: string } | null>(null);
  const submit = useMutation({
    mutationFn: () => api.storefront.submitApplication(product.slug, {
      values,
      context: {
        sourceUrl: window.location.href,
        pageTitle: document.title,
        referrer: document.referrer
      },
      idempotencyKey: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    })
  });

  function setField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await submit.mutateAsync();
    setDone({ number: result.number });
  }

  if (!form) return <section className="storefront-form storefront-form--empty"><h2>Заявка тимчасово недоступна</h2><p>Для вітрини ще не обрано активну форму.</p></section>;
  if (done) return <section className="storefront-form storefront-form--done"><h2>{form.successMessage || 'Заявку надіслано'}</h2><strong>№{done.number}</strong></section>;

  return <form className="storefront-form" onSubmit={(event) => void handleSubmit(event)}>
    <div><h2>{form.title}</h2>{form.description && <p>{form.description}</p>}</div>
    {form.fields.map((field) => <PublicFieldControl field={field} values={values} onChange={setField} key={field.key} />)}
    {submit.error && <p className="form-message form-message--error">{submit.error instanceof Error ? submit.error.message : 'Не вдалося надіслати заявку.'}</p>}
    <button className="button button--primary" type="submit" disabled={submit.isPending}>{form.buttonText || 'Надіслати'} <Icon name="arrowRight" size={16} /></button>
  </form>;
}

export function StorefrontPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [condition, setCondition] = useState<CatalogCondition | 'all'>('all');
  const [availability, setAvailability] = useState<CatalogAvailabilityStatus | 'all'>('all');
  const [sort, setSort] = useState('updated_desc');
  const params = useMemo(() => ({ search, condition, availability, sort, page: 1, pageSize: 24 }), [availability, condition, search, sort]);
  const settings = useQuery({ queryKey: ['storefront-settings'], queryFn: api.storefront.settings });
  const products = useQuery({ queryKey: ['storefront-products', params], queryFn: () => api.storefront.list(params), enabled: !slug });
  const product = useQuery({ queryKey: ['storefront-product', slug], queryFn: () => api.storefront.get(slug!), enabled: Boolean(slug), retry: false });
  const form = useQuery({
    queryKey: ['storefront-form', settings.data?.selectedFormPublicId],
    queryFn: () => api.storefront.form(settings.data!.selectedFormPublicId!),
    enabled: Boolean(settings.data?.selectedFormPublicId),
    retry: false
  });

  useEffect(() => {
    const stream = new EventSource('/api/storefront/stream');
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['storefront-products'] });
      void queryClient.invalidateQueries({ queryKey: ['storefront-product'] });
    };
    stream.addEventListener('storefront', refresh);
    return () => { stream.removeEventListener('storefront', refresh); stream.close(); };
  }, [queryClient]);

  function updateSearch(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
    const next = new URLSearchParams(searchParams);
    if (event.target.value) next.set('search', event.target.value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  const items = products.data?.items || [];

  return <main className="storefront-page">
    <header className="storefront-header">
      <Link to="/storefront" className="storefront-brand"><span>MT</span><strong>Mobile Trend</strong></Link>
      <a className="button button--secondary button--small" href="/login">У робочий простір</a>
    </header>

    {slug && product.data ? <section className="storefront-detail">
      <div className="storefront-detail__media"><ProductImage product={product.data} /></div>
      <article className="storefront-detail__info">
        <Link to="/storefront" className="storefront-back"><Icon name="arrowLeft" size={16} /> До каталогу</Link>
        <p className="eyebrow">{product.data.productCode} · {product.data.conditionLabel}</p>
        <h1>{product.data.name}</h1>
        <div className="storefront-detail__badges"><span>{product.data.availability.label}</span><span>{product.data.priceLabel}</span></div>
        {product.data.shortDescription && <p>{product.data.shortDescription}</p>}
        <dl className="storefront-specs">
          {product.data.bodyCondition && <><dt>Корпус</dt><dd>{product.data.bodyCondition}</dd></>}
          {product.data.displayCondition && <><dt>Дисплей</dt><dd>{product.data.displayCondition}</dd></>}
          {product.data.batteryHealth && <><dt>Акумулятор</dt><dd>{product.data.batteryHealth}</dd></>}
          {product.data.warranty && <><dt>Гарантія</dt><dd>{product.data.warranty}</dd></>}
        </dl>
      </article>
      <StorefrontApplicationForm product={product.data} form={form.data} />
    </section> : <section className="storefront-catalog">
      <div className="storefront-hero">
        <p className="eyebrow">Used & refurbished</p>
        <h1>Смартфони з перевіреним станом</h1>
      </div>
      <div className="storefront-controls">
        <label className="field"><span>Пошук</span><input value={search} onChange={updateSearch} placeholder="iPhone, Samsung, код товару" /></label>
        <StyledSelect value={condition} options={conditionOptions} onChange={(value) => setCondition(value as CatalogCondition | 'all')} />
        <StyledSelect value={availability} options={availabilityOptions} onChange={(value) => setAvailability(value as CatalogAvailabilityStatus | 'all')} />
        <StyledSelect value={sort} options={sortOptions} onChange={(value) => setSort(String(value))} />
      </div>
      <div className="storefront-grid">
        {items.map((item) => <Link to={item.publicPath} className="storefront-card" key={item.id}>
          <ProductImage product={item} />
          <span>{item.conditionLabel}</span>
          <strong>{item.name}</strong>
          <small>{item.productCode} · {item.availability.label}</small>
          <b>{item.priceLabel}</b>
        </Link>)}
      </div>
      {!products.isLoading && !items.length && <div className="storefront-empty"><Icon name="phone" size={32} /><h2>Товарів не знайдено</h2></div>}
    </section>}
  </main>;
}
