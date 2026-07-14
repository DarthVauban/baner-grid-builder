import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  ApplicationBank,
  ApplicationButtonConfig,
  ApplicationButtonInput,
  ApplicationFieldType,
  ApplicationForm,
  ApplicationFormField,
  ApplicationFormInput
} from '../types/application';

const fieldTypeLabels: Record<ApplicationFieldType, string> = {
  text: 'Текст',
  textarea: 'Багаторядковий текст',
  select: 'Select',
  radio: 'Radio',
  checkbox: 'Checkbox',
  email: 'Email',
  phone: 'Телефон',
  number: 'Число'
};

const productSelectorFields = [
  ['title', 'Назва'],
  ['imageUrl', 'Зображення'],
  ['price', 'Ціна'],
  ['oldPrice', 'Стара ціна'],
  ['productCode', 'Код товару']
] as const;

const productSelectorKeys = productSelectorFields.map(([key]) => key);
const priceConditionKey = 'priceCondition';
const choiceFieldTypes = ['select', 'radio', 'checkbox'] as const;

const selectorSources = ['textContent', 'src', 'data-src', 'data-href', 'href', 'value', 'content'] as const;
const fieldTypeOptions = Object.entries(fieldTypeLabels).map(([value, label]) => ({ value: value as ApplicationFieldType, label }));
const insertPositionOptions = [
  { value: 'after' as const, label: 'Після контейнера' },
  { value: 'before' as const, label: 'Перед контейнером' },
  { value: 'start' as const, label: 'На початку' },
  { value: 'end' as const, label: 'В кінці' }
];
const fontWeightOptions = [
  { value: '400', label: 'Звичайний' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' }
];
const selectorSourceOptions = selectorSources.map((source) => ({ value: source, label: source }));

function isChoiceFieldType(type: ApplicationFieldType) {
  return choiceFieldTypes.includes(type as typeof choiceFieldTypes[number]);
}

function optionValueFromLabel(label: string, index: number) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || `option_${index + 1}`;
}

function newOption(index: number) {
  return {
    label: `Варіант ${index + 1}`,
    value: `option_${index + 1}`,
    sortOrder: index,
    active: true
  };
}

function sanitizeProductSelectors(selectors: Record<string, unknown> = {}) {
  const sanitized = productSelectorKeys.reduce<Record<string, unknown>>((result, key) => {
    if (selectors[key]) result[key] = selectors[key];
    return result;
  }, {});
  const condition = selectors[priceConditionKey];
  if (condition && typeof condition === 'object') {
    const value = condition as { enabled?: unknown; minPrice?: unknown };
    sanitized[priceConditionKey] = {
      enabled: value.enabled === true,
      minPrice: typeof value.minPrice === 'string' ? value.minPrice.trim() : value.minPrice == null ? '' : String(value.minPrice).trim()
    };
  }
  return sanitized;
}

const emptyForm: Omit<ApplicationFormInput, 'fields'> = {
  name: 'Нова форма',
  title: 'Залишити заявку',
  description: '',
  buttonText: 'Надіслати',
  successMessage: 'Заявку надіслано. Менеджер звʼяжеться з вами.',
  settings: {},
  styles: {}
};

function cloneFields(form: ApplicationForm | null): ApplicationFormField[] {
  return (form?.fields || []).map((field) => ({
    ...field,
    options: field.options.map((option) => ({ ...option })),
    validation: { ...field.validation }
  }));
}

function newField(index: number): ApplicationFormField {
  return {
    key: `field_${Date.now()}_${index}`,
    label: 'Нове поле',
    type: 'text',
    placeholder: '',
    helpText: '',
    defaultValue: '',
    required: false,
    active: true,
    system: false,
    systemFieldType: null,
    sortOrder: 100 + index,
    validation: {},
    options: []
  };
}

function statusText(status: ApplicationForm['status']) {
  if (status === 'published') return 'Опублікована';
  if (status === 'disabled') return 'Вимкнена';
  if (status === 'archived') return 'Архів';
  return 'Чернетка';
}

export function FormsBuilderPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationFormInput | null>(null);
  const [fields, setFields] = useState<ApplicationFormField[]>([]);
  const [bankDraft, setBankDraft] = useState({ label: '', value: '', active: true, sortOrder: 0 });
  const [buttonDraft, setButtonDraft] = useState<ApplicationButtonInput | null>(null);
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null);
  const [script, setScript] = useState('');
  const [compactScript, setCompactScript] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'button'>('form');
  const forms = useQuery({ queryKey: ['forms'], queryFn: api.forms.list });
  const banks = useQuery({ queryKey: ['form-banks'], queryFn: api.forms.banks });
  const buttons = useQuery({ queryKey: ['form-buttons'], queryFn: api.forms.buttons });
  const selectedForm = useMemo(() => forms.data?.find((form) => form.id === selectedId) || forms.data?.[0] || null, [forms.data, selectedId]);

  useEffect(() => {
    if (!forms.data?.length || selectedId) return;
    setSelectedId(forms.data[0].id);
  }, [forms.data, selectedId]);

  useEffect(() => {
    if (!selectedForm) { setDraft(null); setFields([]); return; }
    setDraft({
      name: selectedForm.name,
      title: selectedForm.title,
      description: selectedForm.description,
      buttonText: selectedForm.buttonText,
      successMessage: selectedForm.successMessage,
      settings: selectedForm.settings,
      styles: selectedForm.styles,
      fields: selectedForm.fields
    });
    setFields(cloneFields(selectedForm));
    setButtonDraft({
      name: `Кнопка ${selectedForm.name}`,
      formId: selectedForm.id,
      selector: '.product-order__row',
      insertPosition: 'end',
      text: selectedForm.buttonText,
      styles: { backgroundColor: '#6d5dfc', color: '#ffffff', borderRadius: '12px', padding: '12px 18px', fontWeight: '700', fontSize: 'inherit' },
      cssClass: '',
      fullWidth: false,
      active: true,
      productSelectors: {
        title: { selector: 'h1', source: 'textContent' },
        imageUrl: { selector: '.gallery__photos-list img[src*="/content/images/"]', source: 'src' },
        price: { selector: '.product-price__item', source: 'textContent' },
        oldPrice: { selector: '.product-price__old-price', source: 'textContent' },
        productCode: { selector: '[data-product-code], .product-code', source: 'textContent' },
        [priceConditionKey]: { enabled: false, minPrice: '' }
      }
    });
    setEditingButtonId(null);
    setScript('');
    setCompactScript('');
  }, [selectedForm]);

  const createForm = useMutation({ mutationFn: api.forms.create });
  const updateForm = useMutation({ mutationFn: ({ id, input }: { id: string; input: ApplicationFormInput }) => api.forms.update(id, input) });
  const duplicateForm = useMutation({ mutationFn: api.forms.duplicate });
  const publishForm = useMutation({ mutationFn: api.forms.publish });
  const disableForm = useMutation({ mutationFn: api.forms.disable });
  const archiveForm = useMutation({ mutationFn: api.forms.archive });
  const createBank = useMutation({ mutationFn: api.forms.createBank });
  const updateBank = useMutation({ mutationFn: ({ id, input }: { id: string; input: Partial<Pick<ApplicationBank, 'label' | 'value' | 'active' | 'sortOrder'>> }) => api.forms.updateBank(id, input) });
  const removeBank = useMutation({ mutationFn: api.forms.removeBank });
  const createButton = useMutation({ mutationFn: api.forms.createButton });
  const updateButton = useMutation({ mutationFn: ({ id, input }: { id: string; input: ApplicationButtonInput }) => api.forms.updateButton(id, input) });
  const archiveButton = useMutation({ mutationFn: api.forms.archiveButton });
  const buttonScript = useMutation({ mutationFn: api.forms.buttonScript });
  const busy = createForm.isPending || updateForm.isPending || duplicateForm.isPending || publishForm.isPending || disableForm.isPending || archiveForm.isPending;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['forms'] }),
      queryClient.invalidateQueries({ queryKey: ['form-banks'] }),
      queryClient.invalidateQueries({ queryKey: ['form-buttons'] })
    ]);
  }

  async function createNewForm() {
    try {
      const form = await createForm.mutateAsync(emptyForm);
      setSelectedId(form.id);
      setActiveTab('form');
      showToast('Форму створено.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося створити форму.', 'error'); }
  }

  async function saveForm() {
    if (!selectedForm || !draft) return;
    try {
      const saved = await updateForm.mutateAsync({ id: selectedForm.id, input: { ...draft, fields } });
      setSelectedId(saved.id);
      showToast('Форму збережено.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося зберегти форму.', 'error'); }
  }

  async function duplicateSelected() {
    if (!selectedForm) return;
    const form = await duplicateForm.mutateAsync(selectedForm.id);
    setSelectedId(form.id);
    showToast('Копію форми створено.');
    await refresh();
  }

  async function setFormPublished() {
    if (!selectedForm) return;
    try {
      await publishForm.mutateAsync(selectedForm.id);
      showToast('Форму опубліковано.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати форму.', 'error'); }
  }

  async function setFormDisabled() {
    if (!selectedForm) return;
    await disableForm.mutateAsync(selectedForm.id);
    showToast('Форму вимкнено.');
    await refresh();
  }

  async function archiveSelected() {
    if (!selectedForm) return;
    const confirmed = await confirm({
      title: 'Архівувати форму?',
      message: `Форма «${selectedForm.name}» буде перенесена в архів.`,
      confirmLabel: 'Архівувати',
      tone: 'danger'
    });
    if (!confirmed) return;
    await archiveForm.mutateAsync(selectedForm.id);
    setSelectedId(null);
    showToast('Форму перенесено в архів.');
    await refresh();
  }

  function updateField(index: number, patch: Partial<ApplicationFormField>) {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? {
      ...field,
      ...patch,
      active: field.system ? true : patch.active ?? field.active,
      required: field.system ? true : patch.required ?? field.required,
      type: field.systemFieldType === 'bank' ? 'select' : field.systemFieldType === 'phone' ? 'phone' : patch.type ?? field.type
    } : field));
  }

  function updateFieldType(index: number, type: ApplicationFieldType) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const options = isChoiceFieldType(type) && field.options.length === 0 ? [newOption(0)] : field.options;
      return {
        ...field,
        type: field.systemFieldType === 'bank' ? 'select' : field.systemFieldType === 'phone' ? 'phone' : type,
        options
      };
    }));
  }

  function updateFieldOption(index: number, optionIndex: number, label: string) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const baseOptions = field.options.length ? field.options : [newOption(0)];
      return {
        ...field,
        options: baseOptions.map((option, itemIndex) => itemIndex === optionIndex ? {
          ...option,
          label,
          value: optionValueFromLabel(label, itemIndex),
          sortOrder: itemIndex
        } : option)
      };
    }));
  }

  function addFieldOption(index: number) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      return { ...field, options: [...field.options, newOption(field.options.length)] };
    }));
  }

  function removeFieldOption(index: number, optionIndex: number) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const options = field.options.filter((_, itemIndex) => itemIndex !== optionIndex).map((option, itemIndex) => ({
        ...option,
        sortOrder: itemIndex
      }));
      return { ...field, options };
    }));
  }

  async function addBank() {
    if (!bankDraft.label.trim()) return;
    try {
      await createBank.mutateAsync(bankDraft);
      setBankDraft({ label: '', value: '', active: true, sortOrder: 0 });
      showToast('Банк додано.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося додати банк.', 'error'); }
  }

  function editButton(button: ApplicationButtonConfig) {
    setEditingButtonId(button.id);
    setActiveTab('button');
    setButtonDraft({
      name: button.name,
      formId: button.formId,
      selector: button.selector,
      insertPosition: button.insertPosition,
      text: button.text,
      styles: button.styles,
      cssClass: button.cssClass,
      fullWidth: button.fullWidth,
      active: button.active,
      productSelectors: sanitizeProductSelectors(button.productSelectors)
    });
    setScript('');
    setCompactScript('');
  }

  async function saveButton(existing?: ApplicationButtonConfig) {
    if (!buttonDraft) return;
    try {
      const target = existing || buttons.data?.find((button) => button.id === editingButtonId);
      const payload = { ...buttonDraft, productSelectors: sanitizeProductSelectors(buttonDraft.productSelectors) };
      const saved = target ? await updateButton.mutateAsync({ id: target.id, input: payload }) : await createButton.mutateAsync(payload);
      setEditingButtonId(saved.id);
      showToast(target ? 'Кнопку оновлено.' : 'Кнопку створено.');
      const generated = await buttonScript.mutateAsync(saved.id);
      setScript(generated.script);
      setCompactScript(generated.compactScript);
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося зберегти кнопку.', 'error'); }
  }

  async function copyCode(value: string, successMessage = 'Скрипт скопійовано.') {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      showToast(successMessage);
    } catch {
      showToast('Не вдалося скопіювати скрипт.', 'error');
    }
  }

  function draftStyle(key: string, fallback = '') {
    return String(draft?.styles?.[key] ?? fallback);
  }

  function updateDraftStyle(key: string, value: string) {
    if (!draft) return;
    setDraft({ ...draft, styles: { ...draft.styles, [key]: value } });
  }

  function buttonStyle(key: string, fallback = '') {
    return String(buttonDraft?.styles?.[key] ?? fallback);
  }

  function updateButtonStyle(key: string, value: string) {
    if (!buttonDraft) return;
    setButtonDraft({ ...buttonDraft, styles: { ...buttonDraft.styles, [key]: value } });
  }

  function selectorConfig(key: string) {
    const config = buttonDraft?.productSelectors?.[key];
    if (!config || typeof config !== 'object') return { selector: '', source: 'textContent' };
    const value = config as { selector?: unknown; source?: unknown };
    return {
      selector: typeof value.selector === 'string' ? value.selector : '',
      source: typeof value.source === 'string' ? value.source : 'textContent'
    };
  }

  function updateProductSelector(key: string, patch: { selector?: string; source?: string }) {
    if (!buttonDraft) return;
    const current = selectorConfig(key);
    setButtonDraft({
      ...buttonDraft,
      productSelectors: {
        ...buttonDraft.productSelectors,
        [key]: { ...current, ...patch }
      }
    });
  }

  function priceCondition() {
    const config = buttonDraft?.productSelectors?.[priceConditionKey];
    if (!config || typeof config !== 'object') return { enabled: false, minPrice: '' };
    const value = config as { enabled?: unknown; minPrice?: unknown };
    return {
      enabled: value.enabled === true,
      minPrice: typeof value.minPrice === 'string' ? value.minPrice : value.minPrice == null ? '' : String(value.minPrice)
    };
  }

  function updatePriceCondition(patch: { enabled?: boolean; minPrice?: string }) {
    if (!buttonDraft) return;
    setButtonDraft({
      ...buttonDraft,
      productSelectors: {
        ...buttonDraft.productSelectors,
        [priceConditionKey]: { ...priceCondition(), ...patch }
      }
    });
  }

  function previewOptions(field: ApplicationFormField) {
    if (field.options.length > 0) return field.options;
    return [{ label: field.type === 'checkbox' ? field.placeholder || 'Так' : 'Варіант', value: 'option', sortOrder: 0, active: true }];
  }

  function renderPreviewControl(field: ApplicationFormField) {
    if (field.type === 'textarea') return <textarea rows={2} placeholder={field.placeholder} />;
    if (field.type === 'select') {
      return <StyledSelect value="" options={[{ value: '', label: 'Оберіть' }, ...previewOptions(field).map((option) => ({ value: option.value, label: option.label }))]} onChange={() => undefined} ariaLabel={`Попередній перегляд ${field.label}`} />;
    }
    if (field.type === 'radio' || field.type === 'checkbox') {
      return <div className={`form-preview__choices form-preview__choices--${field.type}`}>
        {previewOptions(field).map((option) => <small key={option.value}><input type={field.type} name={`preview-${field.key}`} /> {option.label}</small>)}
      </div>;
    }
    return <input placeholder={field.placeholder} />;
  }

  function renderFormPreview() {
    if (!draft) return null;
    return <div className="form-preview" style={{
      '--form-preview-accent': draftStyle('accentColor', '#6d5dfc'),
      '--form-preview-button-bg': draftStyle('buttonBackgroundColor', '#6d5dfc'),
      '--form-preview-button-color': draftStyle('buttonTextColor', '#ffffff'),
      '--form-preview-radius': draftStyle('borderRadius', '12px'),
      '--form-preview-choice-accent': draftStyle('choiceAccentColor', draftStyle('accentColor', '#6d5dfc')),
      '--form-preview-choice-border': draftStyle('choiceBorderColor', '#cfd6e3'),
      '--form-preview-choice-bg': draftStyle('choiceBackgroundColor', '#ffffff'),
      '--form-preview-choice-text': draftStyle('choiceTextColor', '#344054'),
      '--form-preview-checkbox-radius': draftStyle('checkboxRadius', '5px'),
      '--form-preview-number-bg': draftStyle('numberBlockBackgroundColor', '#f6f4ff'),
      '--form-preview-number-border': draftStyle('numberBlockBorderColor', '#d8d4ff'),
      '--form-preview-number-color': draftStyle('numberBlockTextColor', '#172033'),
      '--form-preview-number-radius': draftStyle('numberBlockRadius', '16px')
    } as CSSProperties}>
      <h3>{draft.title}</h3>
      {draft.description && <p>{draft.description}</p>}
      {fields.filter((field) => field.active).map((field) => <label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span>{renderPreviewControl(field)}</label>)}
      <button type="button">{draft.buttonText}</button>
      <div className="form-preview__success">
        <strong>{draft.successMessage}</strong>
        <span><small>Номер заявки</small><b>00007</b></span>
      </div>
    </div>;
  }

  function renderButtonPreview() {
    if (!buttonDraft) return null;
    const previewStyle = {
      ...(buttonDraft.styles || {}),
      backgroundColor: buttonStyle('backgroundColor', '#6d5dfc'),
      color: buttonStyle('color', '#ffffff'),
      borderRadius: buttonStyle('borderRadius', '12px'),
      padding: buttonStyle('padding', '12px 18px'),
      fontWeight: buttonStyle('fontWeight', '700'),
      fontSize: buttonStyle('fontSize', 'inherit'),
      fontFamily: 'inherit'
    } as CSSProperties;
    if (buttonDraft.fullWidth) previewStyle.width = '100%';
    return <div className="button-live-preview">
      <div className="button-live-preview__surface">
        <button className="button-live-preview__button" type="button" style={previewStyle}>{buttonDraft.text || 'Залишити заявку'}</button>
      </div>
      <small>На сайті кнопка автоматично прийме основний шрифт магазину.</small>
    </div>;
  }

  const currentPriceCondition = priceCondition();

  return <div className="forms-builder-page">
    <header className="page-heading page-heading--row">
      <div><p className="eyebrow">Хорошоп</p><h1>Конструктор форм</h1><p>Налаштовуйте pop-up форми, банки, поля, вигляд та скрипти кнопок для сторінок товарів.</p></div>
      <button className="button button--primary" type="button" onClick={() => void createNewForm()} disabled={createForm.isPending}><Icon name="add" size={18} /> Нова форма</button>
    </header>

    <section className="forms-workspace">
      <aside className="forms-left-panel">
        <section className="forms-list">
          <header><strong>Форми</strong><span>{forms.data?.length || 0}</span></header>
          {forms.isLoading && <p>Завантажуємо...</p>}
          {forms.data?.map((form) => <button className={form.id === selectedForm?.id ? 'forms-list__item forms-list__item--active' : 'forms-list__item'} type="button" key={form.id} onClick={() => { setSelectedId(form.id); setScript(''); setCompactScript(''); }}>
            <span><strong>{form.name}</strong><small>{statusText(form.status)} · {form.publicId}</small></span><Icon name="arrow" size={18} />
          </button>)}
        </section>
        {selectedForm && draft && <section className="tool-panel forms-live-preview-panel">
          <header className="tool-panel__header"><div><p className="eyebrow">Live preview</p><h2>{activeTab === 'button' ? 'Кнопка на сайті' : 'Форма заявки'}</h2></div></header>
          {activeTab === 'button' ? renderButtonPreview() : renderFormPreview()}
        </section>}
      </aside>

      <div className="forms-editor">
        {!selectedForm || !draft ? <div className="task-list-state"><span className="task-list-state__icon"><Icon name="integrations" size={28} /></span><h2>Оберіть або створіть форму</h2></div> : <>
          <section className="tool-panel forms-editor-tabs">
            <header className="tool-panel__header">
              <div><p className="eyebrow">Поточна форма</p><h2>{selectedForm.name}</h2></div>
              <span>{statusText(selectedForm.status)}</span>
            </header>
            <div className="segmented" role="tablist" aria-label="Розділи конструктора">
              <button className={activeTab === 'form' ? 'active' : undefined} type="button" role="tab" aria-selected={activeTab === 'form'} onClick={() => setActiveTab('form')}>Редактор форми</button>
              <button className={activeTab === 'button' ? 'active' : undefined} type="button" role="tab" aria-selected={activeTab === 'button'} onClick={() => setActiveTab('button')}>Редактор кнопки</button>
            </div>
          </section>
          {activeTab === 'form' ? <>
          <section className="tool-panel">
            <header className="tool-panel__header"><div><p className="eyebrow">Форма</p><h2>Основні налаштування</h2></div></header>
            <div className="form-builder-grid">
              <label className="field"><span>Назва в адмінці</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={160} /></label>
              <label className="field"><span>Заголовок pop-up</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={220} /></label>
              <label className="field form-builder-grid__wide"><span>Опис</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={5000} rows={3} /></label>
              <label className="field"><span>Текст кнопки</span><input value={draft.buttonText} onChange={(event) => setDraft({ ...draft, buttonText: event.target.value })} maxLength={120} /></label>
              <label className="field"><span>Повідомлення успіху</span><input value={draft.successMessage} onChange={(event) => setDraft({ ...draft, successMessage: event.target.value })} maxLength={240} /></label>
              <label className="field"><span>Акцент форми</span><input type="color" value={draftStyle('accentColor', '#6d5dfc')} onChange={(event) => updateDraftStyle('accentColor', event.target.value)} /></label>
              <label className="field"><span>Колір кнопки</span><input type="color" value={draftStyle('buttonBackgroundColor', '#6d5dfc')} onChange={(event) => updateDraftStyle('buttonBackgroundColor', event.target.value)} /></label>
              <label className="field"><span>Колір тексту кнопки</span><input type="color" value={draftStyle('buttonTextColor', '#ffffff')} onChange={(event) => updateDraftStyle('buttonTextColor', event.target.value)} /></label>
              <label className="field"><span>Заокруглення</span><input value={draftStyle('borderRadius', '12px')} onChange={(event) => updateDraftStyle('borderRadius', event.target.value)} placeholder="12px" /></label>
              <div className="form-builder-section-title">Чекбокси та радіокнопки</div>
              <label className="field"><span>Колір вибору</span><input type="color" value={draftStyle('choiceAccentColor', draftStyle('accentColor', '#6d5dfc'))} onChange={(event) => updateDraftStyle('choiceAccentColor', event.target.value)} /></label>
              <label className="field"><span>Колір рамки</span><input type="color" value={draftStyle('choiceBorderColor', '#cfd6e3')} onChange={(event) => updateDraftStyle('choiceBorderColor', event.target.value)} /></label>
              <label className="field"><span>Фон контролу</span><input type="color" value={draftStyle('choiceBackgroundColor', '#ffffff')} onChange={(event) => updateDraftStyle('choiceBackgroundColor', event.target.value)} /></label>
              <label className="field"><span>Колір тексту</span><input type="color" value={draftStyle('choiceTextColor', '#344054')} onChange={(event) => updateDraftStyle('choiceTextColor', event.target.value)} /></label>
              <label className="field"><span>Заокруглення чекбокса</span><input value={draftStyle('checkboxRadius', '5px')} onChange={(event) => updateDraftStyle('checkboxRadius', event.target.value)} placeholder="5px" /></label>
              <div className="form-builder-section-title">Блок номера заявки</div>
              <label className="field"><span>Фон блоку</span><input type="color" value={draftStyle('numberBlockBackgroundColor', '#f6f4ff')} onChange={(event) => updateDraftStyle('numberBlockBackgroundColor', event.target.value)} /></label>
              <label className="field"><span>Рамка блоку</span><input type="color" value={draftStyle('numberBlockBorderColor', '#d8d4ff')} onChange={(event) => updateDraftStyle('numberBlockBorderColor', event.target.value)} /></label>
              <label className="field"><span>Колір номера</span><input type="color" value={draftStyle('numberBlockTextColor', '#172033')} onChange={(event) => updateDraftStyle('numberBlockTextColor', event.target.value)} /></label>
              <label className="field"><span>Заокруглення номера</span><input value={draftStyle('numberBlockRadius', '16px')} onChange={(event) => updateDraftStyle('numberBlockRadius', event.target.value)} placeholder="16px" /></label>
            </div>
            <footer className="form-builder-actions">
              <button className="button button--primary" type="button" disabled={busy} onClick={() => void saveForm()}><Icon name="save" size={17} /> Зберегти</button>
              <button className="button button--secondary" type="button" disabled={busy} onClick={() => void setFormPublished()}>Опублікувати</button>
              <button className="button button--secondary" type="button" disabled={busy} onClick={() => void setFormDisabled()}>Вимкнути</button>
              <button className="button button--secondary" type="button" disabled={busy} onClick={() => void duplicateSelected()}>Дублювати</button>
              <button className="button button--danger" type="button" disabled={busy} onClick={() => void archiveSelected()}>Архівувати</button>
            </footer>
          </section>

          <section className="tool-panel">
            <header className="tool-panel__header"><div><p className="eyebrow">Поля</p><h2>Структура форми</h2></div><button className="button button--secondary button--small" type="button" onClick={() => setFields((current) => [...current, newField(current.length)])}><Icon name="add" size={15} /> Поле</button></header>
            <div className="form-fields-list">
              {fields.map((field, index) => <article className={field.system ? 'form-field-card form-field-card--system' : 'form-field-card'} key={`${field.key}-${index}`}>
                <header><strong>{field.label}</strong><span>{field.system ? 'Системне' : fieldTypeLabels[field.type]}</span></header>
                <div className="form-builder-grid">
                  <label className="field"><span>Назва</span><input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
                  <div className="field"><span>Тип</span><StyledSelect value={field.type} disabled={field.system} options={fieldTypeOptions} onChange={(value) => updateFieldType(index, value)} ariaLabel={`Тип поля ${field.label}`} /></div>
                  <label className="field"><span>Placeholder</span><input value={field.placeholder} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></label>
                  <label className="field"><span>Підказка</span><input value={field.helpText} onChange={(event) => updateField(index, { helpText: event.target.value })} /></label>
                  {isChoiceFieldType(field.type) && !field.system && <div className="form-options-editor form-builder-grid__wide">
                    <div><strong>Варіанти вибору</strong><button className="button button--secondary button--small" type="button" onClick={() => addFieldOption(index)}><Icon name="add" size={15} /> Додати варіант</button></div>
                    {(field.options.length ? field.options : [newOption(0)]).map((option, optionIndex) => <div className="form-option-row" key={`${option.value}-${optionIndex}`}>
                      <input value={option.label} onChange={(event) => updateFieldOption(index, optionIndex, event.target.value)} placeholder={`Варіант ${optionIndex + 1}`} />
                      <button className="icon-button icon-button--danger" type="button" disabled={field.options.length <= 1} onClick={() => removeFieldOption(index, optionIndex)} aria-label="Видалити варіант"><Icon name="delete" size={16} /></button>
                    </div>)}
                  </div>}
                  <label className="check-field"><input type="checkbox" checked={field.required} disabled={field.system} onChange={(event) => updateField(index, { required: event.target.checked })} /><span>Обовʼязкове</span></label>
                  <label className="check-field"><input type="checkbox" checked={field.active} disabled={field.system} onChange={(event) => updateField(index, { active: event.target.checked })} /><span>Активне</span></label>
                </div>
                {!field.system && <footer><button className="button button--danger button--small" type="button" onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="delete" size={15} /> Видалити</button></footer>}
              </article>)}
            </div>
          </section>

          <section className="tool-panel">
              <header className="tool-panel__header"><div><p className="eyebrow">Банки</p><h2>Варіанти банку</h2></div></header>
              <div className="bank-editor">
                {(banks.data || []).map((bank) => <article key={bank.id}><span><strong>{bank.label}</strong><small>{bank.value}</small></span><label className="check-field"><input type="checkbox" checked={bank.active} onChange={(event) => void updateBank.mutateAsync({ id: bank.id, input: { active: event.target.checked } }).then(refresh)} /><span>Активний</span></label><button className="icon-button icon-button--danger" type="button" onClick={() => void removeBank.mutateAsync(bank.id).then(refresh)} aria-label="Видалити банк"><Icon name="delete" size={17} /></button></article>)}
                <div className="bank-editor__new"><input value={bankDraft.label} onChange={(event) => setBankDraft({ ...bankDraft, label: event.target.value })} placeholder="Назва банку" /><input value={bankDraft.value} onChange={(event) => setBankDraft({ ...bankDraft, value: event.target.value })} placeholder="Технічне значення" /><button className="button button--secondary button--small" type="button" onClick={() => void addBank()}>Додати</button></div>
              </div>
          </section>

          </> : <>
          <section className="tool-panel">
            <header className="tool-panel__header"><div><p className="eyebrow">Кнопки</p><h2>Скрипти для Хорошоп</h2></div></header>
            <div className="button-config-layout">
              <div className="button-config-list">
                {(buttons.data || []).filter((button) => button.formId === selectedForm.id).map((button) => <article key={button.id}><span><strong>{button.name}</strong><small>{button.selector}</small></span><button className="button button--secondary button--small" type="button" onClick={() => editButton(button)}>Редагувати</button><button className="button button--secondary button--small" type="button" onClick={() => void buttonScript.mutateAsync(button.id).then((result) => { setScript(result.script); setCompactScript(result.compactScript); })}>Код</button><button className="icon-button icon-button--danger" type="button" onClick={() => void archiveButton.mutateAsync(button.id).then(refresh)} aria-label="Архівувати кнопку"><Icon name="delete" size={16} /></button></article>)}
              </div>
              {buttonDraft && <div className="button-config-form">
                <label className="field"><span>Назва</span><input value={buttonDraft.name} onChange={(event) => setButtonDraft({ ...buttonDraft, name: event.target.value })} /></label>
                <label className="field"><span>Контейнер</span><input value={buttonDraft.selector} onChange={(event) => setButtonDraft({ ...buttonDraft, selector: event.target.value })} placeholder=".product__buy" /></label>
                <div className="field"><span>Позиція</span><StyledSelect value={buttonDraft.insertPosition} options={insertPositionOptions} onChange={(value) => setButtonDraft({ ...buttonDraft, insertPosition: value })} ariaLabel="Позиція кнопки" /></div>
                <label className="field"><span>Текст кнопки</span><input value={buttonDraft.text} onChange={(event) => setButtonDraft({ ...buttonDraft, text: event.target.value })} /></label>
                <label className="field"><span>CSS-клас</span><input value={buttonDraft.cssClass} onChange={(event) => setButtonDraft({ ...buttonDraft, cssClass: event.target.value })} placeholder="mt-credit-button" /></label>
                <div className="button-config-checks">
                  <label className="check-field"><input type="checkbox" checked={buttonDraft.fullWidth} onChange={(event) => setButtonDraft({ ...buttonDraft, fullWidth: event.target.checked })} /><span>На всю ширину</span></label>
                  <label className="check-field"><input type="checkbox" checked={buttonDraft.active} onChange={(event) => setButtonDraft({ ...buttonDraft, active: event.target.checked })} /><span>Активна</span></label>
                </div>
                <div className="button-style-grid">
                  <label className="field"><span>Фон</span><input type="color" value={buttonStyle('backgroundColor', '#6d5dfc')} onChange={(event) => updateButtonStyle('backgroundColor', event.target.value)} /></label>
                  <label className="field"><span>Текст</span><input type="color" value={buttonStyle('color', '#ffffff')} onChange={(event) => updateButtonStyle('color', event.target.value)} /></label>
                  <div className="field"><span>Жирність шрифту</span><StyledSelect value={buttonStyle('fontWeight', '700')} options={fontWeightOptions} onChange={(value) => updateButtonStyle('fontWeight', value)} ariaLabel="Жирність шрифту кнопки" /></div>
                  <label className="field"><span>Розмір шрифту</span><input value={buttonStyle('fontSize', 'inherit')} onChange={(event) => updateButtonStyle('fontSize', event.target.value)} placeholder="16px або inherit" /></label>
                  <label className="field"><span>Заокруглення</span><input value={buttonStyle('borderRadius', '12px')} onChange={(event) => updateButtonStyle('borderRadius', event.target.value)} /></label>
                  <label className="field"><span>Відступи</span><input value={buttonStyle('padding', '12px 18px')} onChange={(event) => updateButtonStyle('padding', event.target.value)} /></label>
                </div>
                <div className="button-price-condition">
                  <header>
                    <strong>Умова показу</strong>
                    <small>Кнопка не вставлятиметься, якщо ціна товару нижча за вказану суму.</small>
                  </header>
                  <label className="check-field"><input type="checkbox" checked={currentPriceCondition.enabled} onChange={(event) => updatePriceCondition({ enabled: event.target.checked })} /><span>Показувати тільки для товарів від певної ціни</span></label>
                  <label className="field"><span>Мінімальна ціна</span><input value={currentPriceCondition.minPrice} inputMode="decimal" disabled={!currentPriceCondition.enabled} onChange={(event) => updatePriceCondition({ minPrice: event.target.value })} placeholder="Наприклад, 10000" /></label>
                  <small>Ціна читається з селектора товару “Ціна”, за замовчуванням .product-price__item.</small>
                </div>
                <div className="button-selector-grid">
                  <strong>Селектори товару</strong>
                  {productSelectorFields.map(([key, label]) => {
                    const config = selectorConfig(key);
                    return <div className="button-selector-row" key={key}>
                      <label className="field"><span>{label}</span><input value={config.selector} onChange={(event) => updateProductSelector(key, { selector: event.target.value })} placeholder={key === 'title' ? 'h1' : ''} /></label>
                      <div className="field"><span>Джерело</span><StyledSelect value={config.source} options={selectorSourceOptions} onChange={(value) => updateProductSelector(key, { source: value })} ariaLabel={`Джерело селектора ${label}`} /></div>
                    </div>;
                  })}
                </div>
                <button className="button button--primary" type="button" onClick={() => void saveButton()}>Зберегти і згенерувати код</button>
              </div>}
            </div>
            {script && <section className="generated-script">
              <header><span>Скрипт кнопки</span><button className="button button--secondary button--small" type="button" onClick={() => void copyCode(script)}><Icon name="copy" size={15} /> Копіювати</button></header>
              <textarea value={script} readOnly rows={10} />
            </section>}
            {compactScript && <section className="generated-script generated-script--compact">
              <header><span>Компактний скрипт з автооновленням</span><button className="button button--secondary button--small" type="button" onClick={() => void copyCode(compactScript, 'Компактний скрипт скопійовано.')}><Icon name="copy" size={15} /> Копіювати</button></header>
              <textarea value={compactScript} readOnly rows={3} />
            </section>}
          </section>
        </>}
        </>}
      </div>
    </section>
  </div>;
}
