import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { TradeInPublicPage } from '../components/trade-in/TradeInPublicPage';
import {
  createTradeInField,
  createTradeInOption,
  createTradeInStep,
  emptyTradeInCondition,
  moveTradeInItem,
  tradeInId
} from '../lib/trade-in';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  TradeInCondition,
  TradeInConfig,
  TradeInField,
  TradeInFieldType,
  TradeInSettings
} from '../types/trade-in';
import '../styles/trade-in-builder.css';

type BuilderTab = 'page' | 'form' | 'publish';
type PreviewDevice = 'desktop' | 'mobile';

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

function ConditionEditor({ condition, fieldKeys, onChange }: {
  condition: TradeInCondition;
  fieldKeys: string[];
  onChange: (condition: TradeInCondition) => void;
}) {
  return (
    <div className="trade-in-condition">
      <header><strong>Умова показу</strong><small>Порожнє поле означає «показувати завжди».</small></header>
      <div>
        <label className="field"><span>Поле</span><select value={condition.fieldKey} onChange={(event) => onChange({ ...condition, fieldKey: event.target.value })}>
          <option value="">Завжди</option>
          {fieldKeys.map((key) => <option value={key} key={key}>{key}</option>)}
        </select></label>
        <label className="field"><span>Оператор</span><select value={condition.operator} disabled={!condition.fieldKey} onChange={(event) => onChange({ ...condition, operator: event.target.value as TradeInCondition['operator'] })}>
          <option value="equals">дорівнює</option>
          <option value="not_equals">не дорівнює</option>
          <option value="one_of">одне зі значень</option>
          <option value="contains">містить</option>
          <option value="answered">заповнене</option>
        </select></label>
        <label className="field"><span>Значення</span><input disabled={!condition.fieldKey || condition.operator === 'answered'} value={condition.value} placeholder={condition.operator === 'one_of' ? 'apple,smartphone' : 'Значення'} onChange={(event) => onChange({ ...condition, value: event.target.value })} /></label>
      </div>
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
          <label className="field"><span>Шрифт</span><select value={config.theme.fontFamily} onChange={(event) => mutate((next) => { next.theme.fontFamily = event.target.value; })}>
            {['Inter', 'Montserrat', 'Roboto', 'Unbounded'].map((font) => <option key={font}>{font}</option>)}
          </select></label>
          <TextField label="Максимальна ширина, px" type="number" min={720} max={1800} value={config.theme.maxWidth} onChange={(value) => mutate((next) => { next.theme.maxWidth = Number(value) || 1180; })} />
          <TextField label="Заокруглення карток, px" type="number" min={0} max={60} value={config.theme.borderRadius} onChange={(value) => mutate((next) => { next.theme.borderRadius = Number(value) || 0; })} />
          <TextField label="Заокруглення кнопок, px" type="number" min={0} max={60} value={config.theme.buttonRadius} onChange={(value) => mutate((next) => { next.theme.buttonRadius = Number(value) || 0; })} />
          <TextField label="Відступ між секціями, px" type="number" min={24} max={180} value={config.theme.sectionSpacing} onChange={(value) => mutate((next) => { next.theme.sectionSpacing = Number(value) || 24; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Шапка сторінки" description="Бренд, назва розділу та головна кнопка.">
        <SwitchField label="Показувати шапку" checked={config.header.visible} onChange={(value) => mutate((next) => { next.header.visible = value; })} />
        <SwitchField label="Закріплювати під час прокрутки" checked={config.header.sticky} onChange={(value) => mutate((next) => { next.header.sticky = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Назва бренду" value={config.header.brandName} onChange={(value) => mutate((next) => { next.header.brandName = value; })} />
          <TextField label="Назва розділу" value={config.header.sectionLabel} onChange={(value) => mutate((next) => { next.header.sectionLabel = value; })} />
          <TextField label="Текст кнопки" value={config.header.ctaLabel} onChange={(value) => mutate((next) => { next.header.ctaLabel = value; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Головний екран" description="Перший екран сторінки та основний заклик до дії.">
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

      <BuilderSection title="Переваги" description="Картки з аргументами на користь Trade-in.">
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
        <SwitchField label="Показувати секцію" checked={config.contact.visible} onChange={(value) => mutate((next) => { next.contact.visible = value; })} />
        <div className="trade-in-builder-grid">
          <TextField label="Надзаголовок" value={config.contact.eyebrow} onChange={(value) => mutate((next) => { next.contact.eyebrow = value; })} />
          <TextField label="Заголовок" value={config.contact.title} onChange={(value) => mutate((next) => { next.contact.title = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Опис" textarea value={config.contact.description} onChange={(value) => mutate((next) => { next.contact.description = value; })} /></div>
          <TextField label="Текст кнопки" value={config.contact.buttonLabel} onChange={(value) => mutate((next) => { next.contact.buttonLabel = value; })} />
        </div>
      </BuilderSection>

      <BuilderSection title="Підвал і контакти" description="Контактні дані та юридична примітка.">
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

function FieldEditor({ field, fieldKeys, onChange, onRemove }: {
  field: TradeInField;
  fieldKeys: string[];
  onChange: (change: (field: TradeInField) => void) => void;
  onRemove: () => void;
}) {
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);
  return (
    <div className="trade-in-field-editor">
      <header><div><p className="eyebrow">Налаштування поля</p><h3>{field.label}</h3></div><button className="button button--danger button--small" type="button" onClick={onRemove}>Видалити поле</button></header>
      <div className="trade-in-builder-grid">
        <TextField label="Назва поля" value={field.label} onChange={(value) => onChange((next) => { next.label = value; })} />
        <TextField label="Системний ключ" value={field.key} onChange={(value) => onChange((next) => { next.key = value.replace(/[^a-zA-Z0-9_]/g, '_'); })} help="Латиниця, цифри та _; ключ має бути унікальним." />
        <label className="field"><span>Тип поля</span><select value={field.type} onChange={(event) => onChange((next) => {
          next.type = event.target.value as TradeInFieldType;
          if (!['select', 'radio', 'checkbox'].includes(next.type)) next.options = [];
        })}>
          <option value="text">Текст</option><option value="textarea">Багаторядковий текст</option><option value="select">Випадаючий список</option><option value="radio">Один варіант</option><option value="checkbox">Прапорець / кілька варіантів</option><option value="email">Email</option><option value="phone">Телефон</option><option value="number">Число</option>
        </select></label>
        <label className="field"><span>Ширина</span><select value={field.width} onChange={(event) => onChange((next) => { next.width = event.target.value as TradeInField['width']; })}><option value="full">Повна</option><option value="half">Половина</option></select></label>
        <TextField label="Placeholder" value={field.placeholder} onChange={(value) => onChange((next) => { next.placeholder = value; })} />
        <TextField label="Підказка" value={field.helpText} onChange={(value) => onChange((next) => { next.helpText = value; })} />
        {field.type === 'number' && <><TextField label="Мінімум" type="number" value={field.min ?? ''} onChange={(value) => onChange((next) => { next.min = value === '' ? null : Number(value); })} /><TextField label="Максимум" type="number" value={field.max ?? ''} onChange={(value) => onChange((next) => { next.max = value === '' ? null : Number(value); })} /></>}
        <label className="field"><span>Системне призначення</span><select value={field.systemFieldType || ''} onChange={(event) => onChange((next) => { next.systemFieldType = (event.target.value || null) as TradeInField['systemFieldType']; })}>
          <option value="">Звичайне поле</option><option value="first_name">Імʼя клієнта</option><option value="last_name">Прізвище клієнта</option><option value="phone">Телефон клієнта</option>
        </select></label>
      </div>
      <div className="trade-in-builder-switches">
        <SwitchField label="Обовʼязкове" checked={field.required} onChange={(value) => onChange((next) => { next.required = value; })} />
        <SwitchField label="Показувати в підсумку" checked={field.showInSummary} onChange={(value) => onChange((next) => { next.showInSummary = value; })} />
      </div>
      <ConditionEditor condition={field.condition} fieldKeys={fieldKeys.filter((key) => key !== field.key)} onChange={(value) => onChange((next) => { next.condition = value; })} />
      {hasOptions && (
        <section className="trade-in-options-editor">
          <header><div><strong>Варіанти відповіді</strong><small>Для чекбокса без варіантів буде показано один прапорець згоди.</small></div><button type="button" onClick={() => onChange((next) => { next.options.push(createTradeInOption(next.options.length)); })}>+ Додати</button></header>
          <div>{field.options.map((option, index) => <article key={option.id}>
            <input aria-label="Назва варіанта" value={option.label} onChange={(event) => onChange((next) => { next.options[index].label = event.target.value; })} />
            <input aria-label="Значення варіанта" value={option.value} onChange={(event) => onChange((next) => { next.options[index].value = event.target.value; })} />
            <RepeaterActions index={index} count={field.options.length} onMove={(direction) => onChange((next) => { next.options = moveTradeInItem(next.options, index, direction); })} onRemove={() => onChange((next) => { next.options.splice(index, 1); })} />
          </article>)}</div>
        </section>
      )}
    </div>
  );
}

function FormEditor({ config, mutate }: {
  config: TradeInConfig;
  mutate: (change: (next: TradeInConfig) => void) => void;
}) {
  const [selectedStepId, setSelectedStepId] = useState(config.form.steps[0]?.id || '');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const selectedStep = config.form.steps.find((step) => step.id === selectedStepId) || config.form.steps[0];
  const selectedField = selectedStep?.fields.find((field) => field.id === selectedFieldId) || selectedStep?.fields[0];
  const allFieldKeys = useMemo(() => config.form.steps.flatMap((step) => step.fields.map((field) => field.key)).filter(Boolean), [config.form.steps]);

  useEffect(() => {
    if (!selectedStep) return;
    if (selectedStep.id !== selectedStepId) setSelectedStepId(selectedStep.id);
    if (!selectedStep.fields.some((field) => field.id === selectedFieldId)) setSelectedFieldId(selectedStep.fields[0]?.id || '');
  }, [selectedFieldId, selectedStep, selectedStepId]);

  function updateSelectedStep(change: (step: NonNullable<typeof selectedStep>) => void) {
    if (!selectedStep) return;
    mutate((next) => {
      const step = next.form.steps.find((item) => item.id === selectedStep.id);
      if (step) change(step);
    });
  }

  function updateSelectedField(change: (field: TradeInField) => void) {
    if (!selectedStep || !selectedField) return;
    mutate((next) => {
      const field = next.form.steps.find((item) => item.id === selectedStep.id)?.fields.find((item) => item.id === selectedField.id);
      if (field) change(field);
    });
  }

  return (
    <div className="trade-in-builder-stack">
      <BuilderSection title="Загальні налаштування форми" description="Заголовки, кнопки, прогрес і екран успіху." open>
        <div className="trade-in-builder-grid">
          <TextField label="Заголовок форми" value={config.form.title} onChange={(value) => mutate((next) => { next.form.title = value; })} />
          <TextField label="Опис форми" value={config.form.description} onChange={(value) => mutate((next) => { next.form.description = value; })} />
          <TextField label="Кнопка «Назад»" value={config.form.backLabel} onChange={(value) => mutate((next) => { next.form.backLabel = value; })} />
          <TextField label="Кнопка «Далі»" value={config.form.nextLabel} onChange={(value) => mutate((next) => { next.form.nextLabel = value; })} />
          <TextField label="Кнопка відправлення" value={config.form.submitLabel} onChange={(value) => mutate((next) => { next.form.submitLabel = value; })} />
          <TextField label="Заголовок після відправлення" value={config.form.successTitle} onChange={(value) => mutate((next) => { next.form.successTitle = value; })} />
          <div className="trade-in-builder-grid__wide"><TextField label="Текст після відправлення" textarea value={config.form.successText} onChange={(value) => mutate((next) => { next.form.successText = value; })} /></div>
        </div>
        <div className="trade-in-builder-switches">
          <SwitchField label="Показувати прогрес" checked={config.form.showProgress} onChange={(value) => mutate((next) => { next.form.showProgress = value; })} />
          <SwitchField label="Показувати номери кроків" checked={config.form.showStepNumbers} onChange={(value) => mutate((next) => { next.form.showStepNumbers = value; })} />
          <SwitchField label="Показувати підсумок" checked={config.form.showSummary} onChange={(value) => mutate((next) => { next.form.showSummary = value; })} />
        </div>
      </BuilderSection>

      <div className="trade-in-form-builder">
        <aside className="trade-in-form-builder__steps">
          <header><div><strong>Кроки</strong><small>{config.form.steps.length} у формі</small></div><button type="button" onClick={() => {
            const step = createTradeInStep(config.form.steps.length);
            mutate((next) => { next.form.steps.push(step); });
            setSelectedStepId(step.id);
            setSelectedFieldId('');
          }}>+</button></header>
          <ol>{config.form.steps.map((step, index) => <li className={step.id === selectedStep?.id ? 'is-active' : ''} key={step.id}>
            <button type="button" onClick={() => { setSelectedStepId(step.id); setSelectedFieldId(step.fields[0]?.id || ''); }}><span>{index + 1}</span><span><strong>{step.title}</strong><small>{step.fields.length} полів</small></span></button>
            <RepeaterActions index={index} count={config.form.steps.length} onMove={(direction) => mutate((next) => { next.form.steps = moveTradeInItem(next.form.steps, index, direction); })} onRemove={() => {
              mutate((next) => { next.form.steps.splice(index, 1); });
              const fallback = config.form.steps[index + 1] || config.form.steps[index - 1];
              setSelectedStepId(fallback?.id || '');
            }} />
          </li>)}</ol>
        </aside>

        <section className="trade-in-form-builder__workspace">
          {!selectedStep ? <div className="admin-list-state">Додайте перший крок форми.</div> : <>
            <div className="trade-in-step-editor">
              <header><div><p className="eyebrow">Крок форми</p><h2>{selectedStep.title}</h2></div><span>{selectedStep.fields.length} полів</span></header>
              <div className="trade-in-builder-grid">
                <TextField label="Назва кроку" value={selectedStep.title} onChange={(value) => updateSelectedStep((next) => { next.title = value; })} />
                <TextField label="Опис кроку" value={selectedStep.description} onChange={(value) => updateSelectedStep((next) => { next.description = value; })} />
              </div>
              <ConditionEditor condition={selectedStep.condition} fieldKeys={allFieldKeys} onChange={(value) => updateSelectedStep((next) => { next.condition = value; })} />
            </div>
            <div className="trade-in-fields-toolbar"><div><strong>Поля кроку</strong><small>Оберіть поле для детального налаштування.</small></div><button className="button button--primary button--small" type="button" onClick={() => {
              const field = createTradeInField(selectedStep.fields.length);
              updateSelectedStep((next) => { next.fields.push(field); });
              setSelectedFieldId(field.id);
            }}>+ Додати поле</button></div>
            <div className="trade-in-field-tabs">
              {selectedStep.fields.map((field, index) => <article className={field.id === selectedField?.id ? 'is-active' : ''} key={field.id}>
                <button type="button" onClick={() => setSelectedFieldId(field.id)}><span>{field.type}</span><strong>{field.label}</strong><small>{field.key}</small></button>
                <div><button type="button" disabled={index === 0} onClick={() => updateSelectedStep((next) => { next.fields = moveTradeInItem(next.fields, index, -1); })}>↑</button><button type="button" disabled={index === selectedStep.fields.length - 1} onClick={() => updateSelectedStep((next) => { next.fields = moveTradeInItem(next.fields, index, 1); })}>↓</button></div>
              </article>)}
            </div>
            {selectedField
              ? <FieldEditor field={selectedField} fieldKeys={allFieldKeys} onChange={updateSelectedField} onRemove={() => {
                const fieldIndex = selectedStep.fields.findIndex((item) => item.id === selectedField.id);
                updateSelectedStep((next) => { next.fields.splice(fieldIndex, 1); });
                setSelectedFieldId(selectedStep.fields[fieldIndex + 1]?.id || selectedStep.fields[fieldIndex - 1]?.id || '');
              }} />
              : <div className="admin-list-state">У цьому кроці ще немає полів.</div>}
          </>}
        </section>
      </div>
    </div>
  );
}

function PublishEditor({ settings, origin, setOrigin, config, busy, onSave, onPublish }: {
  settings: TradeInSettings;
  origin: string;
  setOrigin: (origin: string) => void;
  config: TradeInConfig;
  busy: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  const stepCount = config.form.steps.length;
  const fieldCount = config.form.steps.reduce((total, step) => total + step.fields.length, 0);
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
        <div><button className="button button--secondary" type="button" disabled={busy} onClick={onSave}><Icon name="save" size={16} /> Зберегти чернетку</button><button className="button button--primary" type="button" disabled={busy} onClick={onPublish}><Icon name="publication" size={16} /> Опублікувати</button></div>
      </section>
    </div>
  );
}

export function TradeInBuilderPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({ queryKey: ['trade-in-settings'], queryFn: api.tradeIn.settings });
  const [config, setConfig] = useState<TradeInConfig | null>(null);
  const [origin, setOrigin] = useState('');
  const [tab, setTab] = useState<BuilderTab>('page');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [previewVisible, setPreviewVisible] = useState(true);

  useEffect(() => {
    if (!settingsQuery.data || config) return;
    setConfig(structuredClone(settingsQuery.data.draftConfig));
    setOrigin(settingsQuery.data.publicOrigin);
  }, [config, settingsQuery.data]);

  const save = useMutation({
    mutationFn: (publish: boolean) => {
      if (!config) throw new Error('Конфігурація не завантажена.');
      return (publish ? api.tradeIn.publish : api.tradeIn.save)({ publicOrigin: origin, config });
    },
    onSuccess: (result, publish) => {
      queryClient.setQueryData(['trade-in-settings'], result);
      setConfig(structuredClone(result.draftConfig));
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

  if (settingsQuery.isLoading || !config) return <div className="admin-list-state">Завантажуємо конструктор Trade-in…</div>;
  if (settingsQuery.error || !settingsQuery.data) return <div className="admin-list-state">Не вдалося завантажити конструктор Trade-in.</div>;

  return (
    <div className={`trade-in-builder-page${previewVisible ? '' : ' trade-in-builder-page--preview-hidden'}`}>
      <header className="trade-in-builder-header">
        <div><p className="eyebrow">Конструктор публічної сторінки</p><h1>Trade-in</h1><p>Налаштуйте сторінку, багатокрокову форму та публікацію на окремому піддомені.</p></div>
        <div className="trade-in-builder-header__actions">
          <span className={dirty ? 'is-dirty' : ''}>{dirty ? 'Є незбережені зміни' : 'Чернетку збережено'}</span>
          <a className="button button--secondary button--small" href="/trade-in/preview/storefront" target="_blank" rel="noreferrer"><Icon name="visibility" size={16} /> Тестова сторінка</a>
          <button className="button button--secondary button--small" type="button" disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}><Icon name="save" size={16} /> Зберегти</button>
          <button className="button button--primary button--small" type="button" disabled={save.isPending} onClick={() => save.mutate(true)}><Icon name="publication" size={16} /> Опублікувати</button>
        </div>
      </header>

      <nav className="trade-in-builder-tabs">
        <button className={tab === 'page' ? 'is-active' : ''} type="button" onClick={() => setTab('page')}><Icon name="edit" size={17} /><span>Сторінка</span></button>
        <button className={tab === 'form' ? 'is-active' : ''} type="button" onClick={() => setTab('form')}><Icon name="formBuilder" size={17} /><span>Форма</span><i>{config.form.steps.length}</i></button>
        <button className={tab === 'publish' ? 'is-active' : ''} type="button" onClick={() => setTab('publish')}><Icon name="publication" size={17} /><span>Публікація</span></button>
      </nav>

      <div className="trade-in-builder-layout">
        <section className="trade-in-builder-controls">
          {tab === 'page' && <PageEditor config={config} mutate={mutate} />}
          {tab === 'form' && <FormEditor config={config} mutate={mutate} />}
          {tab === 'publish' && <PublishEditor settings={settingsQuery.data} origin={origin} setOrigin={setOrigin} config={config} busy={save.isPending} onSave={() => save.mutate(false)} onPublish={() => save.mutate(true)} />}
        </section>

        <aside className={`trade-in-builder-preview trade-in-builder-preview--${previewDevice}`}>
          <header>
            <div><strong>Живе превʼю</strong><small>Зміни відображаються без збереження</small></div>
            <div>
              <button className={previewDevice === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setPreviewDevice('desktop')} aria-label="Десктоп">▱</button>
              <button className={previewDevice === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setPreviewDevice('mobile')} aria-label="Мобільний">▯</button>
              <button type="button" onClick={() => setPreviewVisible(false)} aria-label="Сховати превʼю">×</button>
            </div>
          </header>
          <div className="trade-in-builder-preview__viewport"><TradeInPublicPage config={config} preview compact /></div>
        </aside>
      </div>
      {!previewVisible && <button className="trade-in-builder-preview-toggle" type="button" onClick={() => setPreviewVisible(true)}><Icon name="visibility" size={16} /> Показати превʼю</button>}
    </div>
  );
}
