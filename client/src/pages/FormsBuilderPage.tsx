import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { TradeInLogicEditor } from '../components/trade-in/TradeInLogicEditor';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { getTradeInFormGraph, validateTradeInLogic } from '../lib/trade-in-logic';
import { useUndoableState } from '../lib/use-undoable-state';
import { createDefaultWorkflowForm } from '../lib/workflow-form';
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
import type { TradeInConfig } from '../types/trade-in';

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
  formType: 'simple',
  name: 'Нова форма',
  title: 'Залишити заявку',
  description: '',
  buttonText: 'Надіслати',
  successMessage: 'Заявку надіслано. Менеджер звʼяжеться з вами.',
  settings: {},
  styles: {},
  workflow: null
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
    showInSummary: false,
    sortOrder: 100 + index,
    validation: {},
    options: []
  };
}

function normalizeFormFieldOrder(fields: ApplicationFormField[]) {
  return fields.map((field, sortOrder) => ({ ...field, sortOrder }));
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationFormInput | null>(null);
  const [fields, setFields] = useState<ApplicationFormField[]>([]);
  const [bankDraft, setBankDraft] = useState({ label: '', value: '', active: true, sortOrder: 0 });
  const [buttonDraft, setButtonDraft] = useState<ApplicationButtonInput | null>(null);
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null);
  const [script, setScript] = useState('');
  const [compactScript, setCompactScript] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'button'>('form');
  const [libraryType, setLibraryType] = useState<'all' | ApplicationForm['formType']>('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [fieldDropTarget, setFieldDropTarget] = useState<{ index: number; placement: 'before' | 'after' } | null>(null);
  const {
    state: workflow,
    setState: setWorkflow,
    replaceState: replaceWorkflow,
    undo: undoWorkflow,
    canUndo: canUndoWorkflow,
    historyDepth: workflowHistoryDepth
  } = useUndoableState<TradeInConfig['form'] | null>(null, {
    limit: 50,
    groupWindowMs: 350,
    keyboard: false
  });
  const forms = useQuery({ queryKey: ['forms'], queryFn: api.forms.list });
  const banks = useQuery({ queryKey: ['form-banks'], queryFn: api.forms.banks });
  const buttons = useQuery({ queryKey: ['form-buttons'], queryFn: api.forms.buttons });
  const requestedFormId = searchParams.get('form');
  const libraryOpen = searchParams.get('view') === 'library' && !requestedFormId;
  const selectedForm = useMemo(
    () => forms.data?.find((form) => form.id === selectedId)
      || forms.data?.find((form) => form.id === requestedFormId)
      || null,
    [forms.data, requestedFormId, selectedId]
  );
  const libraryForms = useMemo(() => {
    const search = librarySearch.trim().toLocaleLowerCase('uk-UA');
    return (forms.data || []).filter((form) => {
      if (libraryType !== 'all' && form.formType !== libraryType) return false;
      if (!search) return true;
      return `${form.name} ${form.title} ${form.description}`.toLocaleLowerCase('uk-UA').includes(search);
    });
  }, [forms.data, librarySearch, libraryType]);

  useEffect(() => {
    if (!forms.data) return;
    if (!requestedFormId) {
      if (selectedId) setSelectedId(null);
      return;
    }
    const requestedForm = forms.data.find((form) => form.id === requestedFormId);
    if (requestedForm && requestedForm.id !== selectedId) setSelectedId(requestedForm.id);
    if (!requestedForm && selectedId) setSelectedId(null);
  }, [forms.data, requestedFormId, selectedId]);

  useEffect(() => {
    if (!selectedForm) { setDraft(null); setFields([]); replaceWorkflow(null); return; }
    setDraft({
      formType: selectedForm.formType,
      name: selectedForm.name,
      title: selectedForm.title,
      description: selectedForm.description,
      buttonText: selectedForm.buttonText,
      successMessage: selectedForm.successMessage,
      settings: selectedForm.settings,
      styles: selectedForm.styles,
      workflow: selectedForm.workflow,
      fields: selectedForm.fields
    });
    setFields(cloneFields(selectedForm));
    replaceWorkflow(selectedForm.formType === 'workflow'
      ? structuredClone(selectedForm.workflow || createDefaultWorkflowForm())
      : null);
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
    setDraggedFieldIndex(null);
    setFieldDropTarget(null);
    setScript('');
    setCompactScript('');
  }, [replaceWorkflow, selectedForm]);

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

  function openFormsHome() {
    setSelectedId(null);
    setSearchParams({}, { replace: true });
  }

  function openFormsLibrary() {
    setSelectedId(null);
    setSearchParams({ view: 'library' }, { replace: true });
  }

  function openForm(form: ApplicationForm) {
    setSelectedId(form.id);
    setSearchParams({ form: form.id }, { replace: true });
    setScript('');
    setCompactScript('');
  }

  async function createNewForm(formType: ApplicationFormInput['formType'] = 'simple') {
    try {
      const workflowDefinition = formType === 'workflow' ? createDefaultWorkflowForm() : null;
      const form = await createForm.mutateAsync({
        ...emptyForm,
        formType,
        name: formType === 'workflow' ? 'Нова покрокова форма' : emptyForm.name,
        title: workflowDefinition?.title || emptyForm.title,
        description: workflowDefinition?.description || emptyForm.description,
        buttonText: workflowDefinition?.submitLabel || emptyForm.buttonText,
        successMessage: workflowDefinition?.successText || emptyForm.successMessage,
        workflow: workflowDefinition
      });
      setSelectedId(form.id);
      setSearchParams({ form: form.id }, { replace: true });
      setActiveTab('form');
      showToast('Форму створено.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося створити форму.', 'error'); }
  }

  async function saveForm() {
    if (!selectedForm || !draft) return;
    try {
      const input: ApplicationFormInput = selectedForm.formType === 'workflow' && workflow
        ? {
          ...draft,
          formType: 'workflow',
          title: workflow.title,
          description: workflow.description,
          buttonText: workflow.submitLabel,
          successMessage: workflow.successText,
          workflow
        }
        : { ...draft, formType: 'simple', workflow: null, fields: normalizeFormFieldOrder(fields) };
      const saved = await updateForm.mutateAsync({ id: selectedForm.id, input });
      setSelectedId(saved.id);
      showToast('Форму збережено.');
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося зберегти форму.', 'error'); }
  }

  function mutateWorkflow(change: (next: TradeInConfig) => void) {
    setWorkflow((current) => {
      if (!current) return current;
      const shell = { form: structuredClone(current) } as TradeInConfig;
      change(shell);
      return shell.form;
    });
  }

  async function duplicateSelected() {
    if (!selectedForm) return;
    const form = await duplicateForm.mutateAsync(selectedForm.id);
    setSelectedId(form.id);
    setSearchParams({ form: form.id }, { replace: true });
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
    openFormsLibrary();
    showToast('Форму перенесено в архів.');
    await refresh();
  }

  function updateField(index: number, patch: Partial<ApplicationFormField>) {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? {
      ...field,
      ...patch,
      active: field.system ? true : patch.active ?? field.active,
      required: field.system ? true : patch.required ?? field.required,
      showInSummary: field.system ? true : patch.showInSummary ?? field.showInSummary,
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

  function removeField(index: number) {
    setFields((current) => normalizeFormFieldOrder(current.filter((_, itemIndex) => itemIndex !== index)));
  }

  function reorderField(fromIndex: number, toIndex: number) {
    setFields((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [field] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, field);
      return normalizeFormFieldOrder(next);
    });
  }

  function startFieldDrag(event: DragEvent<HTMLElement>, index: number) {
    setDraggedFieldIndex(index);
    setFieldDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function overField(event: DragEvent<HTMLElement>, index: number) {
    if (draggedFieldIndex === null || draggedFieldIndex === index) return;
    event.preventDefault();
    setFieldDropTarget({ index, placement: draggedFieldIndex < index ? 'after' : 'before' });
  }

  function dropField(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData('text/plain');
    const fromIndex = draggedFieldIndex ?? Number(rawIndex);
    const targetIndex = fieldDropTarget?.index === index && fieldDropTarget.placement === 'after' && fromIndex > index
      ? index + 1
      : fieldDropTarget?.index === index && fieldDropTarget.placement === 'before' && fromIndex < index
        ? index - 1
        : index;
    if (Number.isInteger(fromIndex)) reorderField(fromIndex, targetIndex);
    setDraggedFieldIndex(null);
    setFieldDropTarget(null);
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
        {previewOptions(field).map((option) => <label className="form-preview__choice" key={option.value}><input type={field.type} name={`preview-${field.key}`} /> <span>{option.label}</span></label>)}
      </div>;
    }
    if (field.type === 'phone' || field.systemFieldType === 'phone') {
      return <input type="tel" inputMode="tel" placeholder="+380 (__) ___-__-__" />;
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
      {fields.filter((field) => field.active).map((field) => {
        const content = <><span>{field.label}{field.required ? ' *' : ''}</span>{renderPreviewControl(field)}</>;
        return field.type === 'radio' || field.type === 'checkbox'
          ? <div className="form-preview__field" key={field.key}>{content}</div>
          : <label key={field.key}>{content}</label>;
      })}
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
  const workflowIssues = useMemo(
    () => workflow ? validateTradeInLogic(getTradeInFormGraph(workflow)) : [],
    [workflow]
  );
  const workflowHasErrors = workflowIssues.some((issue) => issue.severity === 'error');

  return <div className={`forms-builder-page${selectedForm?.formType === 'workflow' ? ' forms-builder-page--workflow' : ''}`}>
    <header className="page-heading page-heading--row">
      <div>
        <p className="eyebrow">Єдиний центр форм</p>
        <h1>{selectedForm ? selectedForm.name : libraryOpen ? 'Бібліотека форм' : 'Форми'}</h1>
        <p>{selectedForm
          ? selectedForm.formType === 'workflow'
            ? 'Налаштуйте кроки, поля та логічні переходи покрокової форми.'
            : 'Налаштуйте поля, вигляд pop-up форми та кнопку для сайту.'
          : libraryOpen
            ? 'Переглядайте всі форми, фільтруйте їх за типом і відкривайте потрібний редактор.'
            : 'Оберіть тип нової форми або перейдіть до вже створених форм.'}</p>
      </div>
      {(selectedForm || libraryOpen) && <div className="forms-builder-create-actions">
        {selectedForm && <button className="button button--secondary" type="button" onClick={openFormsLibrary}><Icon name="integrations" size={18} /> Бібліотека</button>}
        <button className="button button--secondary" type="button" onClick={openFormsHome}>До розділу</button>
      </div>}
    </header>

    {!selectedForm && !libraryOpen && <section className="forms-hub" aria-label="Дії з формами">
      <button className="forms-hub-card forms-hub-card--simple" type="button" onClick={() => void createNewForm('simple')} disabled={createForm.isPending}>
        <span className="forms-hub-card__icon"><Icon name="add" size={26} /></span>
        <span className="forms-hub-card__copy"><small>Швидкий сценарій</small><strong>Створити просту форму</strong><span>Pop-up форма з полями, стилями та окремою кнопкою для встановлення на сайт.</span></span>
        <span className="forms-hub-card__action">Перейти до конструктора <Icon name="arrow" size={18} /></span>
      </button>
      <button className="forms-hub-card forms-hub-card--workflow" type="button" onClick={() => void createNewForm('workflow')} disabled={createForm.isPending}>
        <span className="forms-hub-card__icon"><Icon name="variants" size={26} /></span>
        <span className="forms-hub-card__copy"><small>Складний сценарій</small><strong>Створити покрокову форму</strong><span>Графічний редактор кроків, полів, умов та логічних переходів між ними.</span></span>
        <span className="forms-hub-card__action">Перейти до конструктора <Icon name="arrow" size={18} /></span>
      </button>
      <button className="forms-hub-card forms-hub-card--library" type="button" onClick={openFormsLibrary}>
        <span className="forms-hub-card__icon"><Icon name="integrations" size={26} /></span>
        <span className="forms-hub-card__copy"><small>{forms.data?.length || 0} створених</small><strong>Бібліотека форм</strong><span>Усі прості та покрокові форми в одному місці з фільтрами за типом.</span></span>
        <span className="forms-hub-card__action">Відкрити бібліотеку <Icon name="arrow" size={18} /></span>
      </button>
    </section>}

    {!selectedForm && libraryOpen && <section className="forms-library">
      <div className="forms-library__toolbar">
        <div className="segmented forms-library__filters" aria-label="Фільтр типу форми">
          <button className={libraryType === 'all' ? 'active' : undefined} type="button" onClick={() => setLibraryType('all')}>Усі <span>{forms.data?.length || 0}</span></button>
          <button className={libraryType === 'simple' ? 'active' : undefined} type="button" onClick={() => setLibraryType('simple')}>Прості <span>{forms.data?.filter((form) => form.formType === 'simple').length || 0}</span></button>
          <button className={libraryType === 'workflow' ? 'active' : undefined} type="button" onClick={() => setLibraryType('workflow')}>Покрокові <span>{forms.data?.filter((form) => form.formType === 'workflow').length || 0}</span></button>
        </div>
        <label className="forms-library__search"><span>Пошук</span><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Назва або заголовок форми" /></label>
      </div>
      {forms.isLoading ? <div className="task-list-state"><h2>Завантажуємо форми...</h2></div> : libraryForms.length ? <div className="forms-library__grid">
        {libraryForms.map((form) => {
          const graphNodes = form.workflow?.graph?.nodes || [];
          const workflowFieldCount = graphNodes.reduce((total, node) => total + node.fields.length, 0);
          return <button className="forms-library-card" type="button" key={form.id} onClick={() => openForm(form)}>
            <span className="forms-library-card__top">
              <span className={`forms-library-card__type forms-library-card__type--${form.formType}`}>{form.formType === 'workflow' ? 'Покрокова' : 'Проста'}</span>
              <span className={`forms-library-card__status forms-library-card__status--${form.status}`}>{statusText(form.status)}</span>
            </span>
            <span className="forms-library-card__copy"><strong>{form.name}</strong><span>{form.title || 'Без заголовка'}</span></span>
            <span className="forms-library-card__meta">
              <span>{form.formType === 'workflow' ? `${graphNodes.length} нод · ${workflowFieldCount} полів` : `${form.fields.length} полів`}</span>
              <span>Оновлено {new Date(form.updatedAt).toLocaleDateString('uk-UA')}</span>
            </span>
            <span className="forms-library-card__open">Відкрити редактор <Icon name="arrow" size={18} /></span>
          </button>;
        })}
      </div> : <div className="task-list-state"><span className="task-list-state__icon"><Icon name="integrations" size={28} /></span><h2>Форм не знайдено</h2><p>Змініть фільтр або пошуковий запит.</p></div>}
    </section>}

    {selectedForm && <section className={`forms-workspace forms-workspace--editor${selectedForm.formType === 'workflow' ? ' forms-workspace--workflow' : ''}`}>
      <div className="forms-editor">
        {!draft ? <div className="task-list-state"><h2>Завантажуємо редактор...</h2></div> : <>
          {selectedForm.formType === 'workflow' && workflow ? <div className="workflow-form-builder">
            <section className="tool-panel workflow-form-builder__header">
              <header className="tool-panel__header">
                <div><p className="eyebrow">Покрокова форма</p><h2>{draft.name}</h2><p>Уся структура форми та переходи між кроками будуються на полотні нижче.</p></div>
                <span className={workflowHasErrors ? 'workflow-form-builder__issue workflow-form-builder__issue--error' : 'workflow-form-builder__issue'}>
                  {workflowIssues.length ? `${workflowIssues.length} зауважень` : 'Логіка коректна'}
                </span>
              </header>
              <details className="workflow-form-settings">
                <summary>Назва, тексти та поведінка форми</summary>
                <div className="workflow-form-settings__grid">
                  <label className="field"><span>Назва в адмінці</span><input value={draft.name} maxLength={160} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label className="field"><span>Заголовок форми</span><input value={workflow.title} maxLength={220} onChange={(event) => mutateWorkflow((next) => { next.form.title = event.target.value; })} /></label>
                  <label className="field workflow-form-settings__wide"><span>Опис</span><textarea value={workflow.description} rows={2} maxLength={1200} onChange={(event) => mutateWorkflow((next) => { next.form.description = event.target.value; })} /></label>
                  <label className="field"><span>Кнопка «Назад»</span><input value={workflow.backLabel} onChange={(event) => mutateWorkflow((next) => { next.form.backLabel = event.target.value; })} /></label>
                  <label className="field"><span>Кнопка «Далі»</span><input value={workflow.nextLabel} onChange={(event) => mutateWorkflow((next) => { next.form.nextLabel = event.target.value; })} /></label>
                  <label className="field"><span>Кнопка відправлення</span><input value={workflow.submitLabel} onChange={(event) => mutateWorkflow((next) => { next.form.submitLabel = event.target.value; })} /></label>
                  <label className="field"><span>Заголовок успіху</span><input value={workflow.successTitle} onChange={(event) => mutateWorkflow((next) => { next.form.successTitle = event.target.value; })} /></label>
                  <label className="field workflow-form-settings__wide"><span>Повідомлення після відправлення</span><textarea value={workflow.successText} rows={2} onChange={(event) => mutateWorkflow((next) => { next.form.successText = event.target.value; })} /></label>
                  <div className="workflow-form-settings__checks workflow-form-settings__wide">
                    <label className="check-field"><input type="checkbox" checked={workflow.showProgress} onChange={(event) => mutateWorkflow((next) => { next.form.showProgress = event.target.checked; })} /><span>Прогрес проходження</span></label>
                    <label className="check-field"><input type="checkbox" checked={workflow.showStepNumbers} onChange={(event) => mutateWorkflow((next) => { next.form.showStepNumbers = event.target.checked; })} /><span>Номери кроків</span></label>
                    <label className="check-field"><input type="checkbox" checked={workflow.showSummary} onChange={(event) => mutateWorkflow((next) => { next.form.showSummary = event.target.checked; })} /><span>Підсумок відповідей</span></label>
                  </div>
                </div>
              </details>
              <footer className="form-builder-actions">
                <button className="button button--primary" type="button" disabled={busy} onClick={() => void saveForm()}><Icon name="save" size={17} /> Зберегти</button>
                <button className="button button--secondary" type="button" disabled={busy || workflowHasErrors} onClick={() => void setFormPublished()}>Опублікувати</button>
                <button className="button button--secondary" type="button" disabled={busy} onClick={() => void setFormDisabled()}>Вимкнути</button>
                <button className="button button--secondary" type="button" disabled={busy} onClick={() => void duplicateSelected()}>Дублювати</button>
                <button className="button button--danger" type="button" disabled={busy} onClick={() => void archiveSelected()}>Архівувати</button>
              </footer>
            </section>
            <section className="workflow-form-builder__canvas">
              <TradeInLogicEditor
                config={{ form: workflow } as TradeInConfig}
                mutate={mutateWorkflow}
                onUndo={undoWorkflow}
                canUndo={canUndoWorkflow}
                historyDepth={workflowHistoryDepth}
              />
            </section>
          </div> : <>
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
          <details className="tool-panel forms-inline-preview">
            <summary>
              <span><small>Попередній перегляд</small><strong>{activeTab === 'button' ? 'Кнопка на сайті' : 'Форма заявки'}</strong></span>
              <span>Розгорнути</span>
            </summary>
            <div className="forms-inline-preview__body">{activeTab === 'button' ? renderButtonPreview() : renderFormPreview()}</div>
          </details>
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
            <header className="tool-panel__header"><div><p className="eyebrow">Поля</p><h2>Структура форми</h2></div><button className="button button--secondary button--small" type="button" onClick={() => setFields((current) => normalizeFormFieldOrder([...current, newField(current.length)]))}><Icon name="add" size={15} /> Поле</button></header>
            <div className="form-fields-list">
              {fields.map((field, index) => <article
                className={`${field.system ? 'form-field-card form-field-card--system' : 'form-field-card'}${draggedFieldIndex === index ? ' form-field-card--dragging' : ''}${fieldDropTarget?.index === index ? ` form-field-card--drop-${fieldDropTarget.placement}` : ''}`}
                key={field.id || `${field.key}-${index}`}
                onDragOver={(event) => overField(event, index)}
                onDrop={(event) => dropField(event, index)}
                onDragEnd={() => { setDraggedFieldIndex(null); setFieldDropTarget(null); }}
              >
                <header className="form-field-card__bar">
                  <div className="form-field-card__title"><strong>{field.label}</strong><span>{field.system ? 'Системне' : fieldTypeLabels[field.type]}</span></div>
                  <span className="catalog-drag-handle" draggable={fields.length > 1} aria-disabled={fields.length <= 1} title="Перетягнути поле" onDragStart={(event) => startFieldDrag(event, index)}><Icon name="menu" size={18} /> Поле {index + 1}</span>
                </header>
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
                  <label className="check-field form-builder-grid__wide"><input type="checkbox" checked={field.system || field.showInSummary} disabled={field.system} onChange={(event) => updateField(index, { showInSummary: event.target.checked })} /><span>Показувати в основній інформації заявки</span></label>
                </div>
                <footer><button className="button button--danger button--small" type="button" onClick={() => removeField(index)}><Icon name="delete" size={15} /> Видалити</button></footer>
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
        </>}
      </div>
    </section>}
  </div>;
}
