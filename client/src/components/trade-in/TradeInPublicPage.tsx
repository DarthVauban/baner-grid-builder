import { FormEvent, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  isTradeInFieldComplete,
  matchesTradeInCondition,
  tradeInAnswerLabel,
} from '../../lib/trade-in';
import { buildTradeInDisplayPath, getTradeInFormGraph } from '../../lib/trade-in-logic';
import type {
  TradeInAnswer,
  TradeInAnswers,
  TradeInConfig,
  TradeInField,
  TradeInFaqItem
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
  document.getElementById('trade-in-form')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

interface AnimatedNumberParts {
  prefix: string;
  suffix: string;
  target: number;
  fractionDigits: number;
  decimalSeparator: '.' | ',';
}

function parseAnimatedNumber(value: string): AnimatedNumberParts | null {
  const match = value.match(/^(.*?)(-?\d[\d\s]*(?:[.,]\d+)?)(.*)$/);
  if (!match) return null;
  const numericSegment = match[2];
  const rawNumber = numericSegment.trim();
  const target = Number(rawNumber.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(target)) return null;
  const fractionDigits = rawNumber.match(/[.,](\d+)$/)?.[1].length || 0;
  const trailingSpace = numericSegment.match(/\s+$/)?.[0] || '';
  return {
    prefix: match[1],
    suffix: `${trailingSpace}${match[3]}`,
    target,
    fractionDigits,
    decimalSeparator: rawNumber.includes(',') ? ',' : '.'
  };
}

function formatAnimatedNumber(parts: AnimatedNumberParts, value: number) {
  const number = parts.fractionDigits > 0
    ? value.toFixed(parts.fractionDigits).replace('.', parts.decimalSeparator)
    : Math.round(value).toString();
  return `${parts.prefix}${number}${parts.suffix}`;
}

function AnimatedStatValue({ value, animate }: { value: string; animate: boolean }) {
  const elementRef = useRef<HTMLElement>(null);
  const parts = useMemo(() => parseAnimatedNumber(value), [value]);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
    if (!animate || !parts || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return;
    setDisplayValue(formatAnimatedNumber(parts, 0));

    let observer: IntersectionObserver | null = null;
    let animationFrame = 0;
    let started = false;
    let cancelled = false;

    const start = () => {
      if (started || cancelled) return;
      started = true;
      observer?.disconnect();
      const duration = 1_300;
      let startedAt: number | null = null;

      const tick = (now: number) => {
        if (cancelled) return;
        if (startedAt == null) startedAt = now;
        const progress = Math.min(1, (now - startedAt) / duration);
        const easedProgress = 1 - ((1 - progress) ** 3);
        setDisplayValue(progress === 1 ? value : formatAnimatedNumber(parts, parts.target * easedProgress));
        if (progress < 1) animationFrame = requestAnimationFrame(tick);
      };

      animationFrame = requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === 'undefined' || !elementRef.current) {
      start();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) start();
      }, { threshold: 0.35 });
      observer.observe(elementRef.current);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [animate, parts, value]);

  return (
    <strong ref={elementRef} aria-label={value} data-count-up={parts ? 'true' : 'false'}>
      {displayValue}
    </strong>
  );
}

function TradeInFaqAccordion({ items }: { items: TradeInFaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseId = useId().replace(/:/g, '');

  return (
    <div className="ti-faq__list">
      {items.map((item, index) => {
        const open = openId === item.id;
        const buttonId = `${baseId}-faq-button-${index}`;
        const panelId = `${baseId}-faq-panel-${index}`;
        return (
          <article className={`ti-faq-item${open ? ' is-open' : ''}`} key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId((current) => current === item.id ? null : item.id)}
              >
                <span>{item.question}</span>
                <i aria-hidden="true">+</i>
              </button>
            </h3>
            <div
              className="ti-faq-item__panel"
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              aria-hidden={!open}
            >
              <div><p>{item.answer}</p></div>
            </div>
          </article>
        );
      })}
    </div>
  );
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
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>('forward');
  const [transitioning, setTransitioning] = useState(false);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const graph = useMemo(() => getTradeInFormGraph(config.form), [config.form]);
  const graphPath = useMemo(() => buildTradeInDisplayPath(graph, answers), [answers, graph]);
  const activeSteps = useMemo(() => graphPath.filter((node) => node.type === 'fields' || node.type === 'information'), [graphPath]);
  const finishNode = graphPath.find((node) => node.type === 'finish');
  const currentStep = activeSteps[Math.min(stepIndex, Math.max(0, activeSteps.length - 1))];
  const fields = currentStep?.type === 'fields'
    ? currentStep.fields.filter((field) => matchesTradeInCondition(field.condition, answers))
    : [];

  useEffect(() => () => {
    if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  useEffect(() => {
    if (stepIndex < activeSteps.length) return;
    setStepDirection('backward');
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

  function moveToStep(nextIndex: number, direction: 'forward' | 'backward') {
    const targetIndex = Math.min(Math.max(0, nextIndex), Math.max(0, activeSteps.length - 1));
    if (targetIndex === stepIndex || transitioning) return;

    const commit = (animated: boolean) => {
      setStepDirection(direction);
      setStepIndex(targetIndex);
      setInvalidKeys(new Set());
      if (!animated) {
        setTransitioning(false);
        return;
      }
      if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = window.setTimeout(() => setTransitioning(false), 380);
    };

    const node = stepContentRef.current;
    if (!node?.animate || prefersReducedMotion()) {
      commit(false);
      return;
    }

    setTransitioning(true);
    const offset = direction === 'forward' ? -22 : 22;
    node.animate([
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0, transform: `translate3d(${offset}px, 0, 0)` }
    ], {
      duration: 150,
      easing: 'cubic-bezier(.4, 0, 1, 1)',
      fill: 'forwards'
    }).finished.then(() => commit(true), () => commit(true));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (transitioning) return;
    if (!validateCurrentStep()) return;
    if (stepIndex < activeSteps.length - 1) {
      moveToStep(stepIndex + 1, 'forward');
      scrollToForm();
      return;
    }
    if (!finishNode) {
      setSubmitError('Сценарій форми не має підключеного завершення.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = onSubmit
        ? await onSubmit(answers)
        : { number: preview ? 'PREVIEW' : '' };
      setDone(result || { number: '' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally {
      setSubmitting(false);
    }
  }

  const summary = useMemo(() => activeSteps.flatMap((step) => step.type === 'fields'
    ? step.fields.filter((field) => matchesTradeInCondition(field.condition, answers))
    : [])
    .filter((field) => tradeInAnswerLabel(field, answers[field.key]))
    .map((field) => ({ key: field.key, label: field.label, value: tradeInAnswerLabel(field, answers[field.key]) })), [activeSteps, answers]);

  if (done) {
    return (
      <section className="ti-form-shell ti-success" id="trade-in-form">
        <span className="ti-success__icon">✓</span>
        <p className="ti-eyebrow">{preview ? onSubmit ? 'Демо-заявку створено' : 'Режим превʼю' : 'Заявку створено'}</p>
        <h2>{finishNode?.title || config.form.successTitle}</h2>
        <p>{finishNode?.description || config.form.successText}</p>
        {done.number && <div className="ti-success__number"><span>Номер заявки</span><strong>{done.number}</strong></div>}
        <button type="button" className="ti-button ti-button--primary" onClick={() => {
          setAnswers({});
          setStepDirection('forward');
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
      <form className="ti-form-shell" aria-busy={transitioning} onSubmit={(event) => void submit(event)}>
        {config.form.showProgress && (
          <ol className="ti-progress" aria-label="Кроки форми">
            {activeSteps.map((step, index) => (
              <li
                className={index === stepIndex ? 'is-active' : index < stepIndex ? 'is-complete' : ''}
                aria-current={index === stepIndex ? 'step' : undefined}
                key={step.id}
              >
                <button
                  type="button"
                  disabled={index >= stepIndex || transitioning}
                  onClick={() => moveToStep(index, 'backward')}
                >
                  <span>{index < stepIndex ? '✓' : index + 1}</span>
                  <strong>{step.title}</strong>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div
          className={`ti-form-step ti-form-step--${stepDirection}`}
          data-step-direction={stepDirection}
          ref={stepContentRef}
          key={`${currentStep.id}-${stepIndex}`}
        >
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
        </div>
        <footer className="ti-form-actions">
          <button
            className="ti-button ti-button--secondary"
            type="button"
            disabled={stepIndex === 0 || submitting || transitioning}
            onClick={() => {
              moveToStep(stepIndex - 1, 'backward');
            }}
          >
            ← {config.form.backLabel}
          </button>
          <span>Крок {stepIndex + 1} / {activeSteps.length}</span>
          <button className="ti-button ti-button--primary" type="submit" disabled={submitting || transitioning}>
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
            <span><strong>Тестова сторінка Trade-in</strong> Збережена чернетка · заявки надсилаються менеджерам як демо</span>
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
          {config.stats.items.map((item) => (
            <article key={item.id}>
              <AnimatedStatValue value={item.value} animate={!compact} />
              <span>{item.label}</span>
            </article>
          ))}
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
            <TradeInFaqAccordion items={config.faq.items} />
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
