import { useEffect, useMemo, useState } from 'react';
import { catalogConditionOptions, catalogPublicationStatusOptions } from '../lib/catalog';
import {
  countPastedCatalogProducts,
  normalizePastedCatalogProductList
} from '../lib/catalog-filters';
import type { CatalogAdminFilterState } from '../lib/catalog-filters';
import type {
  CatalogAvailabilityStatus,
  CatalogBrand,
  CatalogBrandDirectory,
  CatalogCharacteristicTemplate,
  CatalogFeed,
  CatalogModificationFilter,
  CatalogPresenceFilter,
  CatalogReadinessFilter
} from '../types/catalog';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

type FilterPatch = Partial<CatalogAdminFilterState>;

interface CatalogAdvancedFiltersProps {
  value: CatalogAdminFilterState;
  feed?: CatalogFeed;
  brands: CatalogBrand[];
  brandDirectories: CatalogBrandDirectory[];
  templates: CatalogCharacteristicTemplate[];
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  onClose: () => void;
}

const availabilityOptions: Array<{ value: CatalogAvailabilityStatus; label: string }> = [
  { value: 'in_stock', label: 'В наявності' },
  { value: 'incoming', label: 'В дорозі' },
  { value: 'unavailable', label: 'Немає в наявності' }
];

const presenceOptions = [
  { value: 'all', label: 'Неважливо' },
  { value: 'present', label: 'Заповнено' },
  { value: 'missing', label: 'Не заповнено' }
];

const readinessOptions = [
  { value: 'all', label: 'Будь-яка готовність' },
  { value: 'ready', label: 'Готові до публікації' },
  { value: 'not_ready', label: 'Не готові до публікації' }
];

const modificationOptions = [
  { value: 'all', label: 'Будь-які товари' },
  { value: 'ungrouped', label: 'Без групи модифікацій' },
  { value: 'main', label: 'Основні товари груп' },
  { value: 'child', label: 'Дочірні модифікації' }
];

function toggleValue<T extends string>(current: T[], value: T, checked: boolean) {
  if (checked) return current.includes(value) ? current : [...current, value];
  return current.filter((item) => item !== value);
}

function FilterCheckboxGroup<T extends string>({
  values,
  options,
  onChange,
  className = ''
}: {
  values: T[];
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (values: T[]) => void;
  className?: string;
}) {
  return <div className={`catalog-filter-checks${className ? ` ${className}` : ''}`}>
    {options.map((option) => <label className="catalog-filter-check" key={option.value}>
      <input
        type="checkbox"
        checked={values.includes(option.value)}
        onChange={(event) => onChange(toggleValue(values, option.value, event.target.checked))}
      />
      <span>{option.label}</span>
      {option.count !== undefined && <small>{option.count}</small>}
    </label>)}
  </div>;
}

function PresenceField({ label, value, onChange }: { label: string; value: CatalogPresenceFilter; onChange: (value: CatalogPresenceFilter) => void }) {
  return <label className="field">
    <span>{label}</span>
    <StyledSelect value={value} options={presenceOptions} onChange={(next) => onChange(next as CatalogPresenceFilter)} />
  </label>;
}

export function CatalogAdvancedFilters({
  value,
  feed,
  brands,
  brandDirectories,
  templates,
  onChange,
  onReset,
  onClose
}: CatalogAdvancedFiltersProps) {
  const [productListDraft, setProductListDraft] = useState(value.productList);
  const productListCount = countPastedCatalogProducts(productListDraft);
  const appliedProductListCount = countPastedCatalogProducts(value.productList);
  const productListChanged = normalizePastedCatalogProductList(productListDraft) !== value.productList;
  const productListDiagnostics = feed?.diagnostics?.productList;
  const brandCounts = useMemo(
    () => new Map((feed?.filters?.brands || []).map((brand) => [brand.value, brand.count])),
    [feed?.filters?.brands]
  );

  useEffect(() => setProductListDraft(value.productList), [value.productList]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [onClose]);

  const sortedDirectories = [...brandDirectories].sort((left, right) => left.label.localeCompare(right.label, 'uk-UA'));
  const visibleBrands = [...brands]
    .filter((brand) => !value.brandDirectoryIds.length || value.brandDirectoryIds.includes(brand.directoryId))
    .sort((left, right) => left.label.localeCompare(right.label, 'uk-UA'));
  const visibleTemplates = [...templates]
    .filter((template) => template.active || value.templateIds.includes(template.id))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'uk-UA'));

  function applyProductList() {
    const normalized = normalizePastedCatalogProductList(productListDraft);
    setProductListDraft(normalized);
    onChange({ productList: normalized });
  }

  function setCharacteristic(key: string, values: string[]) {
    const characteristics = { ...value.characteristics };
    if (values.length) characteristics[key] = values;
    else delete characteristics[key];
    onChange({ characteristics });
  }

  return <div className="catalog-filter-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <aside className="catalog-filter-drawer" role="dialog" aria-modal="true" aria-labelledby="catalog-filter-title">
      <header className="catalog-filter-drawer__header">
        <div>
          <p className="eyebrow">Конструктор вибірки</p>
          <h2 id="catalog-filter-title">Усі фільтри</h2>
          <span>{feed ? `Знайдено ${feed.total} товарів` : 'Оновлення вибірки…'}</span>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити фільтри"><Icon name="close" /></button>
      </header>

      <div className="catalog-filter-drawer__body">
        <section className="catalog-filter-section catalog-filter-section--product-list">
          <header>
            <div><h3>Список назв або кодів</h3><p>Вставте колонку з Excel — один товар на кожному рядку.</p></div>
            <span>{productListCount} позицій</span>
          </header>
          <textarea
            value={productListDraft}
            onChange={(event) => setProductListDraft(event.target.value)}
            placeholder={'US-000123\niPhone 15 128GB Black\nUS-000987'}
            aria-label="Список назв або кодів"
            rows={7}
          />
          <div className="catalog-filter-product-list__actions">
            <button className="button button--secondary button--small" type="button" disabled={!productListDraft} onClick={() => { setProductListDraft(''); onChange({ productList: '' }); }}>Очистити список</button>
            <button className="button button--primary button--small" type="button" disabled={!productListChanged} onClick={applyProductList}><Icon name="check" size={15} /> Застосувати список</button>
          </div>
          {appliedProductListCount > 0 && productListDiagnostics && <div className={`catalog-filter-product-list__result${productListDiagnostics.unmatched.length ? ' catalog-filter-product-list__result--warning' : ''}`}>
            <strong>Знайдено {productListDiagnostics.matchedCount} із {productListDiagnostics.requestedCount}</strong>
            {productListDiagnostics.unmatched.length > 0 && <details>
              <summary>Не знайдено: {productListDiagnostics.unmatched.length}</summary>
              <ul>{productListDiagnostics.unmatched.map((item) => <li key={item}>{item}</li>)}</ul>
            </details>}
          </div>}
        </section>

        <section className="catalog-filter-section">
          <header><div><h3>Основне</h3><p>Бренди, стан і шаблон характеристик.</p></div></header>
          <div className="catalog-filter-columns">
            <div className="catalog-filter-group">
              <strong>Стан товару</strong>
              <FilterCheckboxGroup values={value.conditions} options={catalogConditionOptions} onChange={(conditions) => onChange({ conditions })} />
            </div>
            <div className="catalog-filter-group">
              <strong>Статус публікації</strong>
              <FilterCheckboxGroup values={value.statuses} options={catalogPublicationStatusOptions} onChange={(statuses) => onChange({ statuses })} />
            </div>
            <div className="catalog-filter-group">
              <strong>Наявність</strong>
              <FilterCheckboxGroup values={value.availabilities} options={availabilityOptions} onChange={(availabilities) => onChange({ availabilities })} />
            </div>
          </div>
          <div className="catalog-filter-group">
            <strong>Довідники брендів</strong>
            <FilterCheckboxGroup values={value.brandDirectoryIds} options={sortedDirectories.map((item) => ({ value: item.id, label: item.label }))} onChange={(brandDirectoryIds) => onChange({ brandDirectoryIds })} />
          </div>
          <div className="catalog-filter-group">
            <strong>Бренди</strong>
            <FilterCheckboxGroup className="catalog-filter-checks--scroll" values={value.brandIds} options={visibleBrands.map((item) => ({ value: item.id, label: item.label, count: brandCounts.get(item.id) }))} onChange={(brandIds) => onChange({ brandIds })} />
          </div>
          <div className="catalog-filter-group">
            <strong>Шаблони характеристик</strong>
            <FilterCheckboxGroup values={value.templateIds} options={visibleTemplates.map((item) => ({ value: item.id, label: item.label }))} onChange={(templateIds) => onChange({ templateIds })} />
          </div>
        </section>

        <section className="catalog-filter-section">
          <header><div><h3>Ціна і залишки</h3><p>Можна вказати лише одну межу або діапазон.</p></div></header>
          <div className="catalog-filter-range-grid">
            <label className="field"><span>Ціна від, ₴</span><input type="number" min={0} value={value.priceMin} onChange={(event) => onChange({ priceMin: event.target.value })} /></label>
            <label className="field"><span>Ціна до, ₴</span><input type="number" min={0} value={value.priceMax} onChange={(event) => onChange({ priceMax: event.target.value })} /></label>
            <label className="field"><span>Залишок від</span><input type="number" min={0} step={1} value={value.stockMin} onChange={(event) => onChange({ stockMin: event.target.value })} /></label>
            <label className="field"><span>Залишок до</span><input type="number" min={0} step={1} value={value.stockMax} onChange={(event) => onChange({ stockMax: event.target.value })} /></label>
            <label className="field"><span>У дорозі від</span><input type="number" min={0} step={1} value={value.incomingMin} onChange={(event) => onChange({ incomingMin: event.target.value })} /></label>
            <label className="field"><span>У дорозі до</span><input type="number" min={0} step={1} value={value.incomingMax} onChange={(event) => onChange({ incomingMax: event.target.value })} /></label>
          </div>
        </section>

        <section className="catalog-filter-section">
          <header><div><h3>Наповнення і готовність</h3><p>Швидко знайдіть товари з незаповненими даними.</p></div></header>
          <div className="catalog-filter-range-grid">
            <PresenceField label="Головне фото" value={value.photoStatus} onChange={(photoStatus) => onChange({ photoStatus })} />
            <PresenceField label="Опис" value={value.descriptionStatus} onChange={(descriptionStatus) => onChange({ descriptionStatus })} />
            <PresenceField label="Характеристики" value={value.characteristicsStatus} onChange={(characteristicsStatus) => onChange({ characteristicsStatus })} />
            <PresenceField label="Серійний номер / IMEI" value={value.serialStatus} onChange={(serialStatus) => onChange({ serialStatus })} />
            <label className="field"><span>Готовність</span><StyledSelect value={value.readiness} options={readinessOptions} onChange={(readiness) => onChange({ readiness: readiness as CatalogReadinessFilter })} /></label>
            <label className="field"><span>Модифікації</span><StyledSelect value={value.modification} options={modificationOptions} onChange={(modification) => onChange({ modification: modification as CatalogModificationFilter })} /></label>
          </div>
        </section>

        {(feed?.filters?.characteristics || []).length > 0 && <section className="catalog-filter-section">
          <header><div><h3>Характеристики</h3><p>Поля автоматично беруться з актуальних шаблонів.</p></div></header>
          <div className="catalog-filter-characteristics">
            {feed?.filters?.characteristics.map((field) => <div className="catalog-filter-group" key={field.key}>
              <strong>{field.label}{field.unit ? `, ${field.unit}` : ''}</strong>
              <FilterCheckboxGroup
                className="catalog-filter-checks--scroll"
                values={value.characteristics[field.key] || []}
                options={field.options.map((option) => ({ value: option.value, label: option.label, count: option.count }))}
                onChange={(values) => setCharacteristic(field.key, values)}
              />
            </div>)}
          </div>
        </section>}

        <section className="catalog-filter-section">
          <header><div><h3>Дати</h3><p>Періоди створення або останнього оновлення.</p></div></header>
          <div className="catalog-filter-range-grid">
            <label className="field"><span>Створено від</span><input type="date" value={value.createdFrom} onChange={(event) => onChange({ createdFrom: event.target.value })} /></label>
            <label className="field"><span>Створено до</span><input type="date" value={value.createdTo} onChange={(event) => onChange({ createdTo: event.target.value })} /></label>
            <label className="field"><span>Оновлено від</span><input type="date" value={value.updatedFrom} onChange={(event) => onChange({ updatedFrom: event.target.value })} /></label>
            <label className="field"><span>Оновлено до</span><input type="date" value={value.updatedTo} onChange={(event) => onChange({ updatedTo: event.target.value })} /></label>
          </div>
        </section>
      </div>

      <footer className="catalog-filter-drawer__footer">
        <button className="button button--secondary" type="button" onClick={onReset}>Скинути всі фільтри</button>
        <button className="button button--primary" type="button" onClick={onClose}>Показати {feed?.total ?? 0} товарів</button>
      </footer>
    </aside>
  </div>;
}
