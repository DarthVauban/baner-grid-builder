import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  isTradeInFieldComplete,
  tradeInAnswerLabel,
  visibleTradeInFields,
  visibleTradeInSteps
} from '../../lib/trade-in';
import type {
  TradeInAnswer,
  TradeInAnswers,
  TradeInConfig,
  TradeInField
} from '../../types/trade-in';
import '../../styles/trade-in-public.css';

interface SubmissionResult {
  number: string;
}

interface TradeInPublicPageProps {
  config: TradeInConfig;
  preview?: boolean;
  compact?: boolean;
  onSubmit?: (values: TradeInAnswers) => Promise<SubmissionResult>;
}

function scrollToForm() {
  document.getElementById('trade-in-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function TradeInFieldControl({
  field,
  value,
  invalid,
  onChange
}: {
  field: TradeInField;
  value: TradeInAnswer | undefined;
  invalid: boolean;
  onChange: (value: TradeInAnswer) => void;
}) {
  const className = `ti-field ti-field--${field.width}${invalid ? ' is-invalid' : ''}`;
  const heading = <span className="ti-field__label">{field.label}{field.required ? ' *' : ''}</span>;
  const help = field.helpText ? <small>{field.helpText}</small> : null;

  if (field.type === 'radio') {
    return (
      <fieldset className={`${className} ti-choice`}>
        <legend>{heading}</legend>
        <div>
          {field.options.map((option) => (
            <label className={value === option.value ? 'is-selected' : ''} key={option.id}>
              <input
                type="radio"
                name={field.key}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <span><strong>{option.label}</strong></span>
              <i aria-hidden="true">✓</i>
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  if (field.type === 'checkbox' && field.options.length) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className={`${className} ti-choice`}>
        <legend>{heading}</legend>
        <div>
          {field.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label className={checked ? 'is-selected' : ''} key={option.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onChange(event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value))}
                />
                <span><strong>{option.label}</strong></span>
                <i aria-hidden="true">✓</i>
              </label>
            );
          })}
        </div>
        {help}
      </fieldset>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className={`${className} ti-consent`}>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{field.label}{field.required ? ' *' : ''}</span>
        {help}
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className={className}>
        {heading}
        <textarea
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {help}
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className={className}>
        {heading}
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          <option value="">{field.placeholder || 'Оберіть варіант'}</option>
          {field.options.map((option) => <option value={option.value} key={option.id}>{option.label}</option>)}
        </select>
        {help}
      </label>
    );
  }

  return (
    <label className={className}>
      {heading}
      <input
        type={field.type === 'phone' ? 'tel' : field.type}
        inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'numeric' : undefined}
        autoComplete={field.systemFieldType === 'first_name' ? 'given-name' : field.systemFieldType === 'last_name' ? 'family-name' : field.systemFieldType === 'phone' ? 'tel' : undefined}
        min={field.type === 'number' && field.min != null ? field.min : undefined}
        max={field.type === 'number' && field.max != null ? field.max : undefined}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {help}
    </label>
  );
}

function TradeInWizard({
  config,
  preview,
  onSubmit
}: {
  config: TradeInConfig;
  preview: boolean;
  onSubmit?: TradeInPublicPageProps['onSubmit'];
}) {
  const [answers, setAnswers] = useState<TradeInAnswers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<SubmissionResult | null>(null);
  const activeSteps = useMemo(() => visibleTradeInSteps(config.form.steps, answers), [answers, config.form.steps]);
  const currentStep = activeSteps[Math.min(stepIndex, Math.max(0, activeSteps.length - 1))];
  const fields = currentStep ? visibleTradeInFields(currentStep, answers) : [];

  useEffect(() => {
    if (stepIndex < activeSteps.length) return;
    setStepIndex(Math.max(0, activeSteps.length - 1));
  }, [activeSteps.length, stepIndex]);

  function setValue(field: TradeInField, nextValue: TradeInAnswer) {
    setAnswers((current) => ({ ...current, [field.key]: nextValue }));
    setInvalidKeys((current) => {
      if (!current.has(field.key)) return current;
      const next = new Set(current);
      next.delete(field.key);
      return next;
    });
  }

  function validateCurrentStep() {
    const invalid = fields.filter((field) => !isTradeInFieldComplete(field, answers[field.key]));
    setInvalidKeys(new Set(invalid.map((field) => field.key)));
    return invalid.length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validateCurrentStep()) return;
    if (stepIndex < activeSteps.length - 1) {
      setStepIndex((current) => current + 1);
      setInvalidKeys(new Set());
      document.getElementById('trade-in-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = preview
        ? { number: 'PREVIEW' }
        : await onSubmit?.(answers);
      setDone(result || { number: '' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally {
      setSubmitting(false);
    }
  }

  const summary = useMemo(() => activeSteps.flatMap((step) => visibleTradeInFields(step, answers))
    .filter((field) => field.showInSummary && tradeInAnswerLabel(field, answers[field.key]))
    .map((field) => ({ key: field.key, label: field.label, value: tradeInAnswerLabel(field, answers[field.key]) })), [activeSteps, answers]);

  if (done) {
    return (
      <section className="ti-form-shell ti-success" id="trade-in-form">
        <span className="ti-success__icon">✓</span>
        <p className="ti-eyebrow">{preview ? 'Режим превʼю' : 'Заявку створено'}</p>
        <h2>{config.form.successTitle}</h2>
        <p>{config.form.successText}</p>
        {done.number && <div className="ti-success__number"><span>Номер заявки</span><strong>{done.number}</strong></div>}
        <button type="button" className="ti-button ti-button--primary" onClick={() => {
          setAnswers({});
          setStepIndex(0);
          setDone(null);
        }}>Заповнити ще раз</button>
      </section>
    );
  }

  if (!currentStep) {
    return <section className="ti-form-shell ti-empty" id="trade-in-form"><h2>Форма ще не налаштована</h2></section>;
  }

  return (
    <section className="ti-form-section" id="trade-in-form">
      <div className="ti-section-heading ti-section-heading--center">
        <p className="ti-eyebrow">Онлайн-анкета</p>
        <h2>{config.form.title}</h2>
        {config.form.description && <p>{config.form.description}</p>}
      </div>
      <form className="ti-form-shell" onSubmit={(event) => void submit(event)}>
        {config.form.showProgress && (
          <ol className="ti-progress" aria-label="Кроки форми">
            {activeSteps.map((step, index) => (
              <li className={index === stepIndex ? 'is-active' : index < stepIndex ? 'is-complete' : ''} key={step.id}>
                <button type="button" disabled={index > stepIndex} onClick={() => index < stepIndex && setStepIndex(index)}>
                  <span>{index < stepIndex ? '✓' : index + 1}</span>
                  <strong>{step.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="ti-form-shell__heading">
          {config.form.showStepNumbers && <span>{String(stepIndex + 1).padStart(2, '0')}</span>}
          <div>
            <p>Крок {stepIndex + 1} з {activeSteps.length}</p>
            <h3>{currentStep.title}</h3>
            {currentStep.description && <small>{currentStep.description}</small>}
          </div>
        </div>
        <div className="ti-field-grid">
          {fields.map((field) => (
            <TradeInFieldControl
              field={field}
              value={answers[field.key]}
              invalid={invalidKeys.has(field.key)}
              onChange={(value) => setValue(field, value)}
              key={field.id}
            />
          ))}
        </div>
        {invalidKeys.size > 0 && <p className="ti-form-error">Заповніть обовʼязкові поля цього кроку.</p>}
        {submitError && <p className="ti-form-error">{submitError}</p>}
        {config.form.showSummary && stepIndex === activeSteps.length - 1 && summary.length > 0 && (
          <aside className="ti-summary">
            <h4>Підсумок анкети</h4>
            <dl>{summary.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
          </aside>
        )}
        <footer className="ti-form-actions">
          <button
            className="ti-button ti-button--secondary"
            type="button"
            disabled={stepIndex === 0 || submitting}
            onClick={() => {
              setStepIndex((current) => Math.max(0, current - 1));
              setInvalidKeys(new Set());
            }}
          >
            ← {config.form.backLabel}
          </button>
          <span>Крок {stepIndex + 1} / {activeSteps.length}</span>
          <button className="ti-button ti-button--primary" type="submit" disabled={submitting}>
            {submitting ? 'Надсилаємо…' : stepIndex === activeSteps.length - 1 ? config.form.submitLabel : config.form.nextLabel} →
          </button>
        </footer>
      </form>
    </section>
  );
}

export function TradeInPublicPage({ config, preview = false, compact = false, onSubmit }: TradeInPublicPageProps) {
  const rootRef = useRef<HTMLElement>(null);
  const style = {
    '--ti-font': config.theme.fontFamily,
    '--ti-bg': config.theme.backgroundColor,
    '--ti-surface': config.theme.surfaceColor,
    '--ti-text': config.theme.textColor,
    '--ti-muted': config.theme.mutedColor,
    '--ti-primary': config.theme.primaryColor,
    '--ti-primary-text': config.theme.primaryTextColor,
    '--ti-border': config.theme.borderColor,
    '--ti-success': config.theme.successColor,
    '--ti-max-width': `${config.theme.maxWidth}px`,
    '--ti-radius': `${config.theme.borderRadius}px`,
    '--ti-button-radius': `${config.theme.buttonRadius}px`,
    '--ti-section-gap': `${config.theme.sectionSpacing}px`
  } as CSSProperties;

  useEffect(() => {
    if (compact) return;
    document.title = config.seo.title || 'Trade-in Mobile Trend';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = config.seo.description;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = preview ? 'noindex, nofollow' : config.seo.robots;
  }, [compact, config.seo.description, config.seo.robots, config.seo.title, preview]);

  return (
    <main className={`ti-page${compact ? ' ti-page--compact' : ''}`} style={style} ref={rootRef}>
      {preview && !compact && (
        <div className="ti-preview-banner">
          <div className="ti-container">
            <span><strong>Тестова сторінка Trade-in</strong> Збережена чернетка · заявки не надсилаються</span>
            <a href="/trade-in/editor">← До конструктора</a>
          </div>
        </div>
      )}
      {config.header.visible && (
        <header className={`ti-header${config.header.sticky && !compact ? ' is-sticky' : ''}`}>
          <div className="ti-container">
            <a className="ti-brand" href="#top" onClick={(event) => {
              event.preventDefault();
              rootRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <span>MT</span>
              <strong>{config.header.brandName}</strong>
              <small>{config.header.sectionLabel}</small>
            </a>
            <button className="ti-button ti-button--primary ti-button--small" type="button" onClick={scrollToForm}>{config.header.ctaLabel}</button>
          </div>
        </header>
      )}

      {config.hero.visible && (
        <section className="ti-hero" id="top">
          <div className="ti-container ti-hero__layout">
            <div className="ti-hero__copy">
              <p className="ti-eyebrow">{config.hero.eyebrow}</p>
              <h1>{config.hero.title}</h1>
              <p>{config.hero.description}</p>
              <div className="ti-hero__actions">
                <button className="ti-button ti-button--primary" type="button" onClick={scrollToForm}>{config.hero.primaryActionLabel} →</button>
                {config.hero.secondaryText && <span>{config.hero.secondaryText}</span>}
              </div>
            </div>
            <div className="ti-hero__visual" aria-hidden="true">
              <div className="ti-device ti-device--back" />
              <div className="ti-device ti-device--front"><span>↻</span></div>
              {config.hero.badge && <strong>{config.hero.badge}</strong>}
            </div>
          </div>
        </section>
      )}

      {config.stats.visible && config.stats.items.length > 0 && (
        <section className="ti-stats"><div className="ti-container">
          {config.stats.items.map((item) => <article key={item.id}><strong>{item.value}</strong><span>{item.label}</span></article>)}
        </div></section>
      )}

      {config.process.visible && (
        <section className="ti-section">
          <div className="ti-container">
            <div className="ti-section-heading">
              <p className="ti-eyebrow">{config.process.eyebrow}</p>
              <h2>{config.process.title}</h2>
              {config.process.description && <p>{config.process.description}</p>}
            </div>
            <div className="ti-card-grid ti-card-grid--process">
              {config.process.items.map((item, index) => (
                <article key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.text}</p></article>
              ))}
            </div>
          </div>
        </section>
      )}

      {config.benefits.visible && (
        <section className="ti-section ti-section--soft">
          <div className="ti-container">
            <div className="ti-section-heading ti-section-heading--center">
              <p className="ti-eyebrow">{config.benefits.eyebrow}</p>
              <h2>{config.benefits.title}</h2>
            </div>
            <div className="ti-card-grid">
              {config.benefits.items.map((item, index) => (
                <article key={item.id}><span className="ti-card-icon">{['◇', '✓', '↗'][index % 3]}</span><h3>{item.title}</h3><p>{item.text}</p></article>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="ti-container"><TradeInWizard config={config} preview={preview} onSubmit={onSubmit} /></div>

      {config.faq.visible && config.faq.items.length > 0 && (
        <section className="ti-section ti-faq">
          <div className="ti-container">
            <div className="ti-section-heading">
              <p className="ti-eyebrow">{config.faq.eyebrow}</p>
              <h2>{config.faq.title}</h2>
            </div>
            <div>{config.faq.items.map((item) => <details key={item.id}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div>
          </div>
        </section>
      )}

      {config.contact.visible && (
        <section className="ti-contact">
          <div className="ti-container">
            <div><p className="ti-eyebrow">{config.contact.eyebrow}</p><h2>{config.contact.title}</h2><p>{config.contact.description}</p></div>
            <button className="ti-button ti-button--light" type="button" onClick={scrollToForm}>{config.contact.buttonLabel} →</button>
          </div>
        </section>
      )}

      {config.footer.visible && (
        <footer className="ti-footer">
          <div className="ti-container">
            <div><strong>{config.footer.companyName}</strong><p>{config.footer.description}</p></div>
            <div>
              {config.footer.phone && <a href={`tel:${config.footer.phone}`}>{config.footer.phone}</a>}
              {config.footer.email && <a href={`mailto:${config.footer.email}`}>{config.footer.email}</a>}
              <small>{config.footer.legalText}</small>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
