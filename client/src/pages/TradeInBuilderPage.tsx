import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { TradeInPublicPage } from '../components/trade-in/TradeInPublicPage';
import { moveTradeInItem, tradeInId } from '../lib/trade-in';
import { getTradeInFormGraph, validateTradeInLogic } from '../lib/trade-in-logic';
import { api } from '../lib/api';
import { useUndoableState } from '../lib/use-undoable-state';
import { useToast } from '../toast/ToastContext';
import type { TradeInConfig, TradeInFontFamily, TradeInSectionTypography, TradeInSettings } from '../types/trade-in';
import type { ApplicationForm } from '../types/application';
import '../styles/trade-in-builder.css';

type BuilderTab = 'page' | 'publish';
type PreviewDevice = 'desktop' | 'mobile';

const tradeInFontOptions = ['Garet', 'Inter', 'Montserrat', 'Roboto', 'Unbounded'].map((font) => ({ value: font, label: font }));
const tradeInWeightOptions = [300, 400, 500, 600, 700, 800, 900].map((weight) => ({ value: String(weight), label: String(weight) }));
const garetWeightOptions = [400, 800].map((weight) => ({ value: String(weight), label: String(weight) }));

function BuilderSection({ title, description, children, open = false }: {
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="trade-in-builder-section" open={open}>
      <summary><span><strong>{title}</strong>{description && <small>{description}</small>}</span><i>⌄</i></summary>
      <div className="trade-in-builder-section__body">{children}</div>
    </details>
  );
}

function SwitchField({ label, checked, onChange, help }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
}) {
  return (
    <label className="trade-in-builder-switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{help && <small>{help}</small>}</span>
      <i />
    </label>
  );
}

function TextField({ label, value, onChange, textarea = false, type = 'text', min, max, help }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  textarea?: boolean;
  type?: string;
  min?: number;
  max?: number;
  help?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {textarea
        ? <textarea value={value} onChange={(event) => onChange(event.target.value)} />
        : <input type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />}
      {help && <small>{help}</small>}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="trade-in-color-field">
      <span>{label}</span>
      <div><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} /><input value={value} onChange={(event) => onChange(event.target.value)} /></div>
    </label>
  );
}

function TypographyEditor({ value, onChange, headingLabel = 'Заголовки', bodyLabel = 'Основний текст' }: {
  value: TradeInSectionTypography;
  onChange: (value: TradeInSectionTypography) => void;
  headingLabel?: string;
  bodyLabel?: string;
}) {
  const renderGroup = (kind: 'heading' | 'body', label: string) => {
    const familyKey = kind === 'heading' ? 'headingFontFamily' : 'bodyFontFamily';
    const sizeKey = kind === 'heading' ? 'headingFontSize' : 'bodyFontSize';
    const weightKey = kind === 'heading' ? 'headingFontWeight' : 'bodyFontWeight';
    const weightOptions = value[familyKey] === 'Garet' ? garetWeightOptions : tradeInWeightOptions;
    return (
      <section className="trade-in-typography-editor__group">
        <strong>{label}</strong>
        <div className="trade-in-builder-grid trade-in-builder-grid--typography">
          <label className="field">
            <span>Шрифт</span>
            <StyledSelect
              value={value[familyKey]}
              options={tradeInFontOptions}
              onChange={(font) => {
                const family = font as TradeInFontFamily;
                const weight = family === 'Garet' ? (value[weightKey] >= 600 ? 800 : 400) : value[weightKey];
                onChange({ ...value, [familyKey]: family, [weightKey]: weight });
              }}
              ariaLabel={`Шрифт: ${label}`}
            />
          </label>
          <TextField
            label="Розмір, px"
            type="number"
            min={8}
            max={kind === 'heading' ? 120 : 72}
            value={value[sizeKey]}
            onChange={(size) => onChange({ ...value, [sizeKey]: Number(size) || 8 })}
          />
          <label className="field">
            <span>Насиченість</span>
            <StyledSelect
              value={String(value[weightKey])}
              options={weightOptions}
              onChange={(weight) => onChange({ ...value, [weightKey]: Number(weight) })}
              ariaLabel={`Насиченість: ${label}`}
            />
          </label>
        </div>
      </section>
    );
  };

  return (
    <div className="trade-in-typography-editor">
      <header><strong>Типографіка секції</strong><small>Окремі параметри для заголовків і звичайного тексту.</small></header>
      <div>{renderGroup('heading', headingLabel)}{renderGroup('body', bodyLabel)}</div>
    </div>
  );
}

function RepeaterActions({ index, count, onMove, onRemove }: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="trade-in-repeater-actions">
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Перемістити вище">↑</button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Перемістити нижче">↓</button>
      <button className="is-danger" type="button" onClick={onRemove} aria-label="Видалити">×</button>
    </div>
  );
}

function PageEditor({ config, mutate }: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
}) {
  return (
    <div className="trade-in-builder-stack">
      <BuilderSection title="Дизайн і сітка" description="Кольори, шрифт, ширина та заокруглення всієї сторінки." open>
        <div className="trade-in-builder-grid trade-in-builder-grid--colors">
          {([
            ['backgroundColor', 'Фон сторінки'],
            ['surfaceColor', 'Фон карток'],
            ['textColor', 'Основний текст'],
            ['mutedColor', 'Другорядний текст'],
            ['primaryColor', 'Акцент'],
            ['primaryTextColor', 'Текст на акценті'],
            ['borderColor', 'Межі'],
            ['successColor', 'Успішна заявка']
          ] as const).map(([key, label]) => <ColorField label={label} value={config.theme[key]} onChange={(value) => mutate((next) => { next.theme[key] = value; })} key={key} />)}
        </div>
        <div className="trade-in-builder-grid">
          <label className="field"><span>Основний шрифт сторінки</span><StyledSelect value={config.theme.fontFamily} options={tradeInFontOptions} onChange={(value) => mutate((next) => { next.theme.fontFamily = value as TradeInFontFamily; })} ariaLabel="Основний шрифт сторінки" /></label>
          <TextField label="Максимальна ширина, px" type="number" min={720} max={1800} value={config.theme.maxWidth} onChange={(value) => mutate((next) => { next.theme.maxWidth = Number(value) || 1180; })} />
          <TextField label="Заокруглення карток, px" type="number" min={0} max={60} value={config.theme.borderRadius} onChange={(value) => mutate((next) => { next.theme.borderRadius = Number(value) || 0; })} />
          <TextField label="Заокруглення кнопок, px" type="number" min={0} max={60} value={config.theme.buttonRadius} onChange={(value) => mutate((next) => { next.theme.buttonRadius = Number(value) || 0; })} />
          <TextField label="Відступ між секціями, px" type="number" min={24} max={180} value={config.theme.sectionSpacing} onChange={(value) => mutate((next) => { next.theme.sectionSpacing = Number(value) || 24; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Шапка сторінки" description="Бренд, назва розділу та головна кнопка.">
        <TypographyEditor value={config.typography.header} onChange={(value) => mutate((next) => { next.typography.header = value; })} />
        <SwitchField label="Показувати шапку" checked={config.header.visible} onChange={(value) => mutate((next) => { next.header.visible = value; })} />
        <SwitchField label="Закріплювати під час прокрутки" checked={config.header.sticky} onChange={(value) => mutate((next) => { next.header.sticky = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Назва бренду" value={config.header.brandName} onChange={(value) => mutate((next) => { next.header.brandName = value; })} />
          <TextField label="Назва розділу" value={config.header.sectionLabel} onChange={(value) => mutate((next) => { next.header.sectionLabel = value; })} />
          <TextField label="Текст кнопки" value={config.header.ctaLabel} onChange={(value) => mutate((next) => { next.header.ctaLabel = value; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Головний екран" description="Перший екран сторінки та основний заклик до дії.">
        <TypographyEditor value={config.typography.hero} onChange={(value) => mutate((next) => { next.typography.hero = value; })} />
        <SwitchField label="Показувати головний екран" checked={config.hero.visible} onChange={(value) => mutate((next) => { next.hero.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.hero.eyebrow} onChange={(value) => mutate((next) => { next.hero.eyebrow = value; })} />
          <TextField label="Позначка на ілюстрації" value={config.hero.badge} onChange={(value) => mutate((next) => { next.hero.badge = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Заголовок" value={config.hero.title} textarea onChange={(value) => mutate((next) => { next.hero.title = value; })} /></div>
          <div className="trade-in-builder-grid__wide"><TextField label="Опис" value={config.hero.description} textarea onChange={(value) => mutate((next) => { next.hero.description = value; })} /></div>
          <TextField label="Текст головної кнопки" value={config.hero.primaryActionLabel} onChange={(value) => mutate((next) => { next.hero.primaryActionLabel = value; })} />
          <TextField label="Примітка біля кнопки" value={config.hero.secondaryText} onChange={(value) => mutate((next) => { next.hero.secondaryText = value; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Показники мережі" description="Короткі факти або ключові цифри.">
        <TypographyEditor value={config.typography.stats} headingLabel="Цифри" bodyLabel="Пояснення" onChange={(value) => mutate((next) => { next.typography.stats = value; })} />
        <SwitchField label="Показувати секцію" checked={config.stats.visible} onChange={(value) => mutate((next) => { next.stats.visible = value; })} />
        <div className="trade-in-repeater">
          {config.stats.items.map((item, index) => <article key={item.id}>
            <div className="trade-in-builder-grid"><TextField label="Значення" value={item.value} onChange={(value) => mutate((next) => { next.stats.items[index].value = value; })} /><TextField label="Пояснення" value={item.label} onChange={(value) => mutate((next) => { next.stats.items[index].label = value; })} /></div>
            <RepeaterActions index={index} count={config.stats.items.length} onMove={(direction) => mutate((next) => { next.stats.items = moveTradeInItem(next.stats.items, index, direction); })} onRemove={() => mutate((next) => { next.stats.items.splice(index, 1); })} />
          </article>)}
          <button className="trade-in-add-button" type="button" onClick={() => mutate((next) => { next.stats.items.push({ id: tradeInId('stat'), value: '0', label: 'Новий показник' }); })}>+ Додати показник</button>
        </div>
      </BuilderSection>

      <BuilderSection title="Як це працює" description="Заголовки та кроки, які пояснюють процес клієнту.">
        <TypographyEditor value={config.typography.process} onChange={(value) => mutate((next) => { next.typography.process = value; })} />
        <SwitchField label="Показувати секцію" checked={config.process.visible} onChange={(value) => mutate((next) => { next.process.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.process.eyebrow} onChange={(value) => mutate((next) => { next.process.eyebrow = value; })} />
          <TextField label="Заголовок" value={config.process.title} onChange={(value) => mutate((next) => { next.process.title = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Опис" value={config.process.description} textarea onChange={(value) => mutate((next) => { next.process.description = value; })} /></div>
        </div>
        <div className="trade-in-repeater">
          {config.process.items.map((item, index) => <article key={item.id}>
            <TextField label={`Крок ${index + 1}`} value={item.title} onChange={(value) => mutate((next) => { next.process.items[index].title = value; })} />
            <TextField label="Опис" value={item.text} textarea onChange={(value) => mutate((next) => { next.process.items[index].text = value; })} />
            <RepeaterActions index={index} count={config.process.items.length} onMove={(direction) => mutate((next) => { next.process.items = moveTradeInItem(next.process.items, index, direction); })} onRemove={() => mutate((next) => { next.process.items.splice(index, 1); })} />
          </article>)}
          <button className="trade-in-add-button" type="button" onClick={() => mutate((next) => { next.process.items.push({ id: tradeInId('process'), title: 'Новий крок', text: '' }); })}>+ Додати крок</button>
        </div>
      </BuilderSection>

      <BuilderSection title="Форма на сторінці" description="Типографіка підключеної покрокової форми.">
        <TypographyEditor value={config.typography.form} onChange={(value) => mutate((next) => { next.typography.form = value; })} />
      </BuilderSection>

      <BuilderSection title="Переваги" description="Картки з аргументами на користь Trade-in.">
        <TypographyEditor value={config.typography.benefits} onChange={(value) => mutate((next) => { next.typography.benefits = value; })} />
        <SwitchField label="Показувати секцію" checked={config.benefits.visible} onChange={(value) => mutate((next) => { next.benefits.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.benefits.eyebrow} onChange={(value) => mutate((next) => { next.benefits.eyebrow = value; })} />
          <TextField label="Заголовок" value={config.benefits.title} onChange={(value) => mutate((next) => { next.benefits.title = value; })} />
        </div>
        <div className="trade-in-repeater">
          {config.benefits.items.map((item, index) => <article key={item.id}>
            <TextField label="Назва переваги" value={item.title} onChange={(value) => mutate((next) => { next.benefits.items[index].title = value; })} />
            <TextField label="Опис" value={item.text} textarea onChange={(value) => mutate((next) => { next.benefits.items[index].text = value; })} />
            <RepeaterActions index={index} count={config.benefits.items.length} onMove={(direction) => mutate((next) => { next.benefits.items = moveTradeInItem(next.benefits.items, index, direction); })} onRemove={() => mutate((next) => { next.benefits.items.splice(index, 1); })} />
          </article>)}
          <button className="trade-in-add-button" type="button" onClick={() => mutate((next) => { next.benefits.items.push({ id: tradeInId('benefit'), title: 'Нова перевага', text: '' }); })}>+ Додати перевагу</button>
        </div>
      </BuilderSection>

      <BuilderSection title="Поширені питання" description="FAQ у нижній частині сторінки.">
        <TypographyEditor value={config.typography.faq} onChange={(value) => mutate((next) => { next.typography.faq = value; })} />
        <SwitchField label="Показувати секцію" checked={config.faq.visible} onChange={(value) => mutate((next) => { next.faq.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.faq.eyebrow} onChange={(value) => mutate((next) => { next.faq.eyebrow = value; })} />
          <TextField label="Заголовок" value={config.faq.title} onChange={(value) => mutate((next) => { next.faq.title = value; })} />
        </div>
        <div className="trade-in-repeater">
          {config.faq.items.map((item, index) => <article key={item.id}>
            <TextField label="Питання" value={item.question} onChange={(value) => mutate((next) => { next.faq.items[index].question = value; })} />
            <TextField label="Відповідь" value={item.answer} textarea onChange={(value) => mutate((next) => { next.faq.items[index].answer = value; })} />
            <RepeaterActions index={index} count={config.faq.items.length} onMove={(direction) => mutate((next) => { next.faq.items = moveTradeInItem(next.faq.items, index, direction); })} onRemove={() => mutate((next) => { next.faq.items.splice(index, 1); })} />
          </article>)}
          <button className="trade-in-add-button" type="button" onClick={() => mutate((next) => { next.faq.items.push({ id: tradeInId('faq'), question: 'Нове питання', answer: '' }); })}>+ Додати питання</button>
        </div>
      </BuilderSection>

      <BuilderSection title="Фінальний заклик" description="Акцентний блок після форми.">
        <TypographyEditor value={config.typography.contact} onChange={(value) => mutate((next) => { next.typography.contact = value; })} />
        <SwitchField label="Показувати секцію" checked={config.contact.visible} onChange={(value) => mutate((next) => { next.contact.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.contact.eyebrow} onChange={(value) => mutate((next) => { next.contact.eyebrow = value; })} />
          <TextField label="Заголовок" value={config.contact.title} onChange={(value) => mutate((next) => { next.contact.title = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Опис" textarea value={config.contact.description} onChange={(value) => mutate((next) => { next.contact.description = value; })} /></div>
          <TextField label="Текст кнопки" value={config.contact.buttonLabel} onChange={(value) => mutate((next) => { next.contact.buttonLabel = value; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Підвал і контакти" description="Контактні дані та юридична примітка.">
        <TypographyEditor value={config.typography.footer} onChange={(value) => mutate((next) => { next.typography.footer = value; })} />
        <SwitchField label="Показувати підвал" checked={config.footer.visible} onChange={(value) => mutate((next) => { next.footer.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Назва компанії" value={config.footer.companyName} onChange={(value) => mutate((next) => { next.footer.companyName = value; })} />
          <TextField label="Телефон" value={config.footer.phone} onChange={(value) => mutate((next) => { next.footer.phone = value; })} />
          <TextField label="Email" type="email" value={config.footer.email} onChange={(value) => mutate((next) => { next.footer.email = value; })} />
          <TextField label="Короткий опис" value={config.footer.description} onChange={(value) => mutate((next) => { next.footer.description = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Юридична примітка" textarea value={config.footer.legalText} onChange={(value) => mutate((next) => { next.footer.legalText = value; })} /></div>
        </div>
      </BuilderSection>

      <BuilderSection title="SEO" description="Заголовок і опис для пошукових систем.">
        <TextField label="SEO title" value={config.seo.title} onChange={(value) => mutate((next) => { next.seo.title = value; })} help={`${config.seo.title.length}/240 символів`} />
        <TextField label="SEO description" textarea value={config.seo.description} onChange={(value) => mutate((next) => { next.seo.description = value; })} help={`${config.seo.description.length}/500 символів`} />
        <TextField label="Robots" value={config.seo.robots} onChange={(value) => mutate((next) => { next.seo.robots = value; })} />
      </BuilderSection>
    </div>
  );
}

function PublishEditor({ settings, origin, setOrigin, config, busy, invalid, onSave, onPublish }: {
  settings: TradeInSettings;
  origin: string;
  setOrigin: (origin: string) => void;
  config: TradeInConfig;
  busy: boolean;
  invalid: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  const graph = getTradeInFormGraph(config.form);
  const stepCount = graph.nodes.filter((node) => node.type === 'fields' || node.type === 'information').length;
  const fieldCount = graph.nodes.reduce((total, node) => total + node.fields.length, 0);
  return (
    <div className="trade-in-publish-editor">
      <section className="trade-in-publication-card">
        <header><span className={settings.status === 'published' ? 'is-published' : ''}><Icon name={settings.status === 'published' ? 'check' : 'edit'} size={19} /></span><div><p className="eyebrow">Статус сторінки</p><h2>{settings.status === 'published' ? 'Опубліковано' : 'Чернетка'}</h2><p>{settings.publishedAt ? `Остання публікація: ${new Date(settings.publishedAt).toLocaleString('uk-UA')}` : 'Сторінка ще не публікувалася.'}</p></div></header>
        <div className="trade-in-publication-stats"><article><strong>{stepCount}</strong><span>кроків форми</span></article><article><strong>{fieldCount}</strong><span>полів</span></article><article><strong>{config.faq.items.length}</strong><span>питань FAQ</span></article></div>
      </section>
      <section className="trade-in-domain-card">
        <header><p className="eyebrow">Окремий піддомен</p><h2>Публічна адреса Trade-in</h2><p>Вкажіть повну адресу піддомену. DNS і проксі налаштовуються окремо на сервері.</p></header>
        <TextField label="Публічна адреса" value={origin} onChange={setOrigin} help="Наприклад: https://tradein.mobiletrend.com.ua" />
        {origin && <a href={origin} target="_blank" rel="noreferrer">Відкрити піддомен <Icon name="openInNew" size={14} /></a>}
      </section>
      <section className="trade-in-publish-actions">
        <div><h2>Зберегти чи опублікувати?</h2><p>Збереження оновлює лише чернетку. Публікація копіює поточну версію на піддомен.</p></div>
        <div><button className="button button--secondary" type="button" disabled={busy} onClick={onSave}><Icon name="save" size={16} /> Зберегти чернетку</button><button className="button button--primary" type="button" disabled={busy || invalid} onClick={onPublish}><Icon name="publication" size={16} /> Опублікувати</button></div>
      </section>
    </div>
  );
}

function FormBindingCard({ forms, selectedId, loading, onChange }: {
  forms: ApplicationForm[];
  selectedId: string;
  loading: boolean;
  onChange: (form: ApplicationForm) => void;
}) {
  const selected = forms.find((form) => form.id === selectedId) || null;
  const graph = selected?.workflow ? getTradeInFormGraph(selected.workflow) : null;
  const stepCount = graph?.nodes.filter((node) => node.type === 'fields' || node.type === 'information').length || 0;
  const fieldCount = graph?.nodes.reduce((total, node) => total + node.fields.length, 0) || 0;

  return <section className="trade-in-form-binding">
    <div>
      <p className="eyebrow">Форма на сторінці</p>
      <h2>Підключена покрокова форма</h2>
      <p>Структура, поля й умови редагуються окремо у спільному розділі «Форми».</p>
    </div>
    <label className="field">
      <span>Форма</span>
      <StyledSelect
        value={selectedId}
        disabled={loading || forms.length === 0}
        onChange={(value) => {
          const form = forms.find((item) => item.id === value);
          if (form) onChange(form);
        }}
        options={forms.length
          ? forms.map((form) => ({ value: form.id, label: `${form.name} · ${form.status === 'published' ? 'опублікована' : 'чернетка'}` }))
          : [{ value: '', label: 'Покрокових форм немає', disabled: true }]}
        ariaLabel="Підключена покрокова форма"
        searchable
      />
    </label>
    {selected && <div className="trade-in-form-binding__summary">
      <span className={`trade-in-form-binding__status trade-in-form-binding__status--${selected.status}`}>
        {selected.status === 'published' ? 'Опублікована' : selected.status === 'disabled' ? 'Вимкнена' : 'Чернетка'}
      </span>
      <span><strong>{stepCount}</strong> кроків</span>
      <span><strong>{fieldCount}</strong> полів</span>
      <a className="button button--secondary button--small" href={`/tools/forms?form=${encodeURIComponent(selected.id)}`}>
        <Icon name="variants" size={15} /> Відкрити конструктор
      </a>
    </div>}
    {selected && selected.status !== 'published' && <p className="trade-in-form-binding__warning">
      Сторінку можна зберегти як чернетку, але для публікації спочатку опублікуйте вибрану форму.
    </p>}
  </section>;
}

export function TradeInBuilderPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({ queryKey: ['trade-in-settings'], queryFn: api.tradeIn.settings });
  const formsQuery = useQuery({ queryKey: ['trade-in-forms'], queryFn: api.tradeIn.forms });
  const {
    state: config,
    setState: setConfig,
    replaceState: replaceConfig,
  } = useUndoableState<TradeInConfig | null>(null, {
    limit: 50,
    groupWindowMs: 350,
    keyboard: false
  });
  const [origin, setOrigin] = useState('');
  const [tab, setTab] = useState<BuilderTab>('page');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [previewVisible, setPreviewVisible] = useState(true);

  useEffect(() => {
    if (!settingsQuery.data || config) return;
    replaceConfig(structuredClone(settingsQuery.data.draftConfig));
    setOrigin(settingsQuery.data.publicOrigin);
  }, [config, replaceConfig, settingsQuery.data]);

  const save = useMutation({
    mutationFn: (publish: boolean) => {
      if (!config) throw new Error('Конфігурація не завантажена.');
      const payload = structuredClone(config);
      const selectedForm = formsQuery.data?.find((form) => form.id === config.formReference.formId);
      if (selectedForm?.workflow) {
        payload.form = structuredClone(selectedForm.workflow);
        payload.formReference = { formId: selectedForm.id, formName: selectedForm.name };
      }
      return (publish ? api.tradeIn.publish : api.tradeIn.save)({ publicOrigin: origin, config: payload });
    },
    onSuccess: (result, publish) => {
      queryClient.setQueryData(['trade-in-settings'], result);
      replaceConfig(structuredClone(result.draftConfig));
      setOrigin(result.publicOrigin);
      showToast(publish ? 'Trade-in сторінку опубліковано.' : 'Чернетку Trade-in збережено.');
    },
    onError: (error) => showToast(error instanceof Error ? error.message : 'Не вдалося зберегти Trade-in.', 'error')
  });

  function mutate(change: (next: TradeInConfig) => void) {
    setConfig((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next);
      return next;
    });
  }

  const dirty = useMemo(() => Boolean(config && settingsQuery.data && (
    JSON.stringify(config) !== JSON.stringify(settingsQuery.data.draftConfig)
    || origin !== settingsQuery.data.publicOrigin
  )), [config, origin, settingsQuery.data]);
  const selectedForm = useMemo(
    () => formsQuery.data?.find((form) => form.id === config?.formReference.formId) || null,
    [config?.formReference.formId, formsQuery.data]
  );
  const effectiveConfig = useMemo(() => {
    if (!config || !selectedForm?.workflow) return config;
    const next = structuredClone(config);
    next.form = structuredClone(selectedForm.workflow);
    next.formReference = { formId: selectedForm.id, formName: selectedForm.name };
    return next;
  }, [config, selectedForm]);
  const logicIssues = useMemo(
    () => effectiveConfig ? validateTradeInLogic(getTradeInFormGraph(effectiveConfig.form)) : [],
    [effectiveConfig]
  );
  const publicationInvalid = selectedForm?.status !== 'published'
    || logicIssues.some((issue) => issue.severity === 'error');

  if (settingsQuery.isLoading || !config || formsQuery.isLoading) return <div className="admin-list-state">Завантажуємо конструктор Trade-in…</div>;
  if (settingsQuery.error || !settingsQuery.data) return <div className="admin-list-state">Не вдалося завантажити конструктор Trade-in.</div>;

  const showEmbeddedPreview = tab === 'page' && previewVisible;

  return (
    <div className={`trade-in-builder-page${showEmbeddedPreview ? '' : ' trade-in-builder-page--preview-hidden'}`}>
      <header className="trade-in-builder-header">
        <div><p className="eyebrow">Конструктор публічної сторінки</p><h1>Trade-in</h1><p>Налаштуйте сторінку, підключіть готову форму та опублікуйте її на окремому піддомені.</p></div>
        <div className="trade-in-builder-header__actions">
          <span className={dirty ? 'is-dirty' : ''}>{dirty ? 'Є незбережені зміни' : 'Чернетку збережено'}</span>
          <a className="button button--secondary button--small" href="/trade-in/preview/storefront" target="_blank" rel="noreferrer"><Icon name="visibility" size={16} /> Тестова сторінка</a>
          <button className="button button--secondary button--small" type="button" disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}><Icon name="save" size={16} /> Зберегти</button>
          <button className="button button--primary button--small" type="button" disabled={save.isPending || publicationInvalid} onClick={() => save.mutate(true)}><Icon name="publication" size={16} /> Опублікувати</button>
        </div>
      </header>

      <nav className="trade-in-builder-tabs">
        <button className={tab === 'page' ? 'is-active' : ''} type="button" onClick={() => setTab('page')}><Icon name="edit" size={17} /><span>Сторінка</span></button>
        <button className={tab === 'publish' ? 'is-active' : ''} type="button" onClick={() => setTab('publish')}><Icon name="publication" size={17} /><span>Публікація</span></button>
      </nav>

      <div className="trade-in-builder-layout">
        <section className="trade-in-builder-controls">
          {tab === 'page' && <>
            <FormBindingCard
              forms={formsQuery.data || []}
              selectedId={config.formReference.formId}
              loading={formsQuery.isLoading}
              onChange={(form) => mutate((next) => {
                next.formReference = { formId: form.id, formName: form.name };
                if (form.workflow) next.form = structuredClone(form.workflow);
              })}
            />
            <PageEditor config={config} mutate={mutate} />
          </>}
          {tab === 'publish' && <PublishEditor settings={settingsQuery.data} origin={origin} setOrigin={setOrigin} config={effectiveConfig || config} busy={save.isPending} invalid={publicationInvalid} onSave={() => save.mutate(false)} onPublish={() => save.mutate(true)} />}
        </section>

        {showEmbeddedPreview && <aside className={`trade-in-builder-preview trade-in-builder-preview--${previewDevice}`}>
          <header>
            <div><strong>Живе превʼю</strong><small>Зміни відображаються без збереження</small></div>
            <div>
              <button className={previewDevice === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setPreviewDevice('desktop')} aria-label="Десктоп">▱</button>
              <button className={previewDevice === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setPreviewDevice('mobile')} aria-label="Мобільний">▯</button>
              <button type="button" onClick={() => setPreviewVisible(false)} aria-label="Сховати превʼю">×</button>
            </div>
          </header>
          <div className="trade-in-builder-preview__viewport"><TradeInPublicPage config={effectiveConfig || config} preview compact /></div>
        </aside>}
      </div>
      {tab === 'page' && !previewVisible && <button className="trade-in-builder-preview-toggle" type="button" onClick={() => setPreviewVisible(true)}><Icon name="visibility" size={16} /> Показати превʼю</button>}
    </div>
  );
}
