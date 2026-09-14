import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApplicationFormLivePreview } from '../components/ApplicationFormLivePreview';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { TradeInLogicEditor } from '../components/trade-in/TradeInLogicEditor';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { transliterateTradeInFieldKey, uniqueTradeInFieldKey } from '../lib/trade-in';
import { getTradeInFormGraph, validateTradeInLogic } from '../lib/trade-in-logic';
import { useUndoableState } from '../lib/use-undoable-state';
import { createDefaultWorkflowForm } from '../lib/workflow-form';
import { useToast } from '../toast/ToastContext';
import type {
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

const choiceFieldTypes = ['select', 'radio', 'checkbox'] as const;

const fieldTypeOptions = Object.entries(fieldTypeLabels).map(([value, label]) => ({ value: value as ApplicationFieldType, label }));

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
  const label = 'Нове поле';
  const baseKey = transliterateTradeInFieldKey(label);
  return {
    key: index === 0 ? baseKey : `${baseKey}_${index + 1}`,
    label,
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
  const [workflowTab, setWorkflowTab] = useState<'builder' | 'settings'>('builder');
  const [libraryType, setLibraryType] = useState<'all' | ApplicationForm['formType']>('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newFormType, setNewFormType] = useState<ApplicationForm['formType'] | null>(null);
  const [newFormName, setNewFormName] = useState('');
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
  const requestedFormId = searchParams.get('form');
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
    setDraggedFieldIndex(null);
    setFieldDropTarget(null);
  }, [replaceWorkflow, selectedForm]);

  const createForm = useMutation({ mutationFn: api.forms.create });
  const updateForm = useMutation({ mutationFn: ({ id, input }: { id: string; input: ApplicationFormInput }) => api.forms.update(id, input) });
  const duplicateForm = useMutation({ mutationFn: api.forms.duplicate });
  const publishForm = useMutation({ mutationFn: api.forms.publish });
  const disableForm = useMutation({ mutationFn: api.forms.disable });
  const archiveForm = useMutation({ mutationFn: api.forms.archive });
  const busy = createForm.isPending || updateForm.isPending || duplicateForm.isPending || publishForm.isPending || disableForm.isPending || archiveForm.isPending;

  useEffect(() => {
    if (!createModalOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !createForm.isPending) setCreateModalOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [createForm.isPending, createModalOpen]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['forms'] });
  }

  function openFormsLibrary() {
    setSelectedId(null);
    setSearchParams({}, { replace: true });
  }

  function openForm(form: ApplicationForm) {
    setSelectedId(form.id);
    setSearchParams({ form: form.id }, { replace: true });
    setWorkflowTab('builder');
  }

  function openCreateModal() {
    setNewFormType(null);
    setNewFormName('');
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createForm.isPending) return;
    setCreateModalOpen(false);
  }

  async function createNewForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formType = newFormType;
    const name = newFormName.trim();
    if (!formType || !name) return;
    try {
      const workflowDefinition = formType === 'workflow' ? createDefaultWorkflowForm() : null;
      const form = await createForm.mutateAsync({
        ...emptyForm,
        formType,
        name,
        title: workflowDefinition?.title || emptyForm.title,
        description: workflowDefinition?.description || emptyForm.description,
        buttonText: workflowDefinition?.submitLabel || emptyForm.buttonText,
        successMessage: workflowDefinition?.successText || emptyForm.successMessage,
        workflow: workflowDefinition
      });
      setSelectedId(form.id);
      setSearchParams({ form: form.id }, { replace: true });
      setWorkflowTab('builder');
      setCreateModalOpen(false);
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

  async function deleteLibraryForm(form: ApplicationForm) {
    const confirmed = await confirm({
      title: 'Видалити форму?',
      message: `Форма «${form.name}» буде видалена з бібліотеки. Створені раніше заявки залишаться доступними.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      await archiveForm.mutateAsync(form.id);
      showToast('Форму видалено з бібліотеки.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити форму.', 'error');
    }
  }

  function updateField(index: number, patch: Partial<ApplicationFormField>) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const nextPatch = { ...patch };
      if (
        typeof patch.label === 'string'
        && (
          field.key === transliterateTradeInFieldKey(field.label)
          || /^field_\d+_\d+$/.test(field.key)
        )
      ) {
        nextPatch.key = uniqueTradeInFieldKey(
          patch.label,
          current.filter((_, otherIndex) => otherIndex !== index).map((item) => item.key)
        );
      }
      return {
        ...field,
        ...nextPatch,
        system: false,
        systemFieldType: null,
        active: patch.active ?? field.active,
        required: patch.required ?? field.required,
        showInSummary: patch.showInSummary ?? field.showInSummary,
        type: patch.type ?? field.type
      };
    }));
  }

  function updateFieldType(index: number, type: ApplicationFieldType) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const options = isChoiceFieldType(type) && field.options.length === 0 ? [newOption(0)] : field.options;
      return {
        ...field,
        type,
        system: false,
        systemFieldType: null,
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

  function draftStyle(key: string, fallback = '') {
    return String(draft?.styles?.[key] ?? fallback);
  }

  function updateDraftStyle(key: string, value: string) {
    if (!draft) return;
    setDraft({ ...draft, styles: { ...draft.styles, [key]: value } });
  }

  const workflowIssues = useMemo(
    () => workflow ? validateTradeInLogic(getTradeInFormGraph(workflow)) : [],
    [workflow]
  );
  const workflowHasErrors = workflowIssues.some((issue) => issue.severity === 'error');
  const simplePreviewInput = useMemo<ApplicationFormInput | null>(() => {
    if (!draft || selectedForm?.formType !== 'simple') return null;
    return { ...draft, formType: 'simple', workflow: null, fields: normalizeFormFieldOrder(fields) };
  }, [draft, fields, selectedForm?.formType]);

  return <div className={`forms-builder-page${selectedForm?.formType === 'workflow' ? ' forms-builder-page--workflow' : ''}${selectedForm?.formType === 'workflow' && workflowTab === 'builder' ? ' forms-builder-page--workflow-builder' : ''}`}>
    <header className="page-heading page-heading--row">
      <div>
        <p className="eyebrow">Єдиний центр форм</p>
        <h1>{selectedForm ? selectedForm.name : 'Бібліотека форм'}</h1>
        <p>{selectedForm
          ? selectedForm.formType === 'workflow'
            ? 'Налаштуйте кроки, поля та логічні переходи покрокової форми.'
            : 'Налаштуйте кастомні поля, тексти й вигляд простої форми.'
          : 'Переглядайте всі форми, фільтруйте їх за типом і відкривайте потрібний редактор.'}</p>
      </div>
      <div className="forms-builder-create-actions">
        {selectedForm
          ? <button className="button button--secondary" type="button" onClick={openFormsLibrary}><Icon name="integrations" size={18} /> Бібліотека</button>
          : <button className="button button--primary" type="button" onClick={openCreateModal}><Icon name="add" size={18} /> Створити форму</button>}
      </div>
    </header>

    {!selectedForm && <section className="forms-library">
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
          return <article className="forms-library-card" key={form.id}>
            <button className="forms-library-card__main" type="button" onClick={() => openForm(form)}>
              <span className="forms-library-card__top">
                <span className={`forms-library-card__type forms-library-card__type--${form.formType}`}>{form.formType === 'workflow' ? 'Покрокова' : 'Проста'}</span>
                <span className={`forms-library-card__status forms-library-card__status--${form.status}`}>{statusText(form.status)}</span>
              </span>
              <span className="forms-library-card__copy"><strong>{form.name}</strong><span>{form.title || 'Без заголовка'}</span></span>
              <span className="forms-library-card__meta">
                <span>{form.formType === 'workflow' ? `${graphNodes.length} нод · ${workflowFieldCount} полів` : `${form.fields.length} полів`}</span>
                <span>Оновлено {new Date(form.updatedAt).toLocaleDateString('uk-UA')}</span>
              </span>
            </button>
            <footer className="forms-library-card__actions">
              <button className="forms-library-card__open" type="button" onClick={() => openForm(form)}>
                Відкрити редактор <Icon name="arrow" size={18} />
              </button>
              <button
                className="forms-library-card__delete"
                type="button"
                disabled={archiveForm.isPending}
                aria-label={`Видалити форму «${form.name}»`}
                title="Видалити форму"
                onClick={() => void deleteLibraryForm(form)}
              >
                <Icon name="delete" size={16} />
              </button>
            </footer>
          </article>;
        })}
      </div> : <div className="task-list-state"><span className="task-list-state__icon"><Icon name="integrations" size={28} /></span><h2>Форм не знайдено</h2><p>Змініть фільтр або пошуковий запит.</p></div>}
    </section>}

    {selectedForm && <section className={`forms-workspace forms-workspace--editor${selectedForm.formType === 'workflow' ? ' forms-workspace--workflow' : ''}`}>
      <div className="forms-editor">
        {!draft ? <div className="task-list-state"><h2>Завантажуємо редактор...</h2></div> : <>
          {selectedForm.formType === 'workflow' && workflow ? <div className={`workflow-form-builder workflow-form-builder--${workflowTab}`}>
            <section className="tool-panel workflow-form-tabs">
              <header className="tool-panel__header">
                <div><p className="eyebrow">Покрокова форма</p><h2>{draft.name}</h2><p>Уся структура форми та переходи між кроками будуються на полотні нижче.</p></div>
                <span className={workflowHasErrors ? 'workflow-form-builder__issue workflow-form-builder__issue--error' : 'workflow-form-builder__issue'}>
                  {workflowIssues.length ? `${workflowIssues.length} зауважень` : 'Логіка коректна'}
                </span>
              </header>
              <div className="segmented workflow-form-tabs__switcher" role="tablist" aria-label="Розділи покрокової форми">
                <button className={workflowTab === 'builder' ? 'active' : undefined} type="button" role="tab" aria-selected={workflowTab === 'builder'} onClick={() => setWorkflowTab('builder')}>Конструктор форми</button>
                <button className={workflowTab === 'settings' ? 'active' : undefined} type="button" role="tab" aria-selected={workflowTab === 'settings'} onClick={() => setWorkflowTab('settings')}>Налаштування</button>
              </div>
            </section>

            {workflowTab === 'settings' ? <section className="tool-panel workflow-form-builder__settings">
              <header className="tool-panel__header">
                <div><p className="eyebrow">Налаштування</p><h2>Назва, тексти та поведінка форми</h2><p>Загальні параметри, які застосовуються до всього покрокового сценарію.</p></div>
              </header>
              <div className="workflow-form-settings__grid">
                <label className="field"><span>Назва в адмінці</span><input value={draft.name} maxLength={160} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="field"><span>Заголовок форми</span><input value={workflow.title} maxLength={220} onChange={(event) => mutateWorkflow((next) => { next.form.title = event.target.value; })} /></label>
                <label className="field workflow-form-settings__wide"><span>Опис</span><textarea value={workflow.description} rows={3} maxLength={1200} onChange={(event) => mutateWorkflow((next) => { next.form.description = event.target.value; })} /></label>
                <label className="field"><span>Кнопка «Назад»</span><input value={workflow.backLabel} onChange={(event) => mutateWorkflow((next) => { next.form.backLabel = event.target.value; })} /></label>
                <label className="field"><span>Кнопка «Далі»</span><input value={workflow.nextLabel} onChange={(event) => mutateWorkflow((next) => { next.form.nextLabel = event.target.value; })} /></label>
                <label className="field"><span>Кнопка відправлення</span><input value={workflow.submitLabel} onChange={(event) => mutateWorkflow((next) => { next.form.submitLabel = event.target.value; })} /></label>
                <label className="field"><span>Заголовок успіху</span><input value={workflow.successTitle} onChange={(event) => mutateWorkflow((next) => { next.form.successTitle = event.target.value; })} /></label>
                <label className="field workflow-form-settings__wide"><span>Повідомлення після відправлення</span><textarea value={workflow.successText} rows={3} onChange={(event) => mutateWorkflow((next) => { next.form.successText = event.target.value; })} /></label>
                <div className="workflow-form-settings__checks workflow-form-settings__wide">
                  <label className="check-field"><input type="checkbox" checked={workflow.showProgress} onChange={(event) => mutateWorkflow((next) => { next.form.showProgress = event.target.checked; })} /><span>Прогрес проходження</span></label>
                  <label className="check-field"><input type="checkbox" checked={workflow.showStepNumbers} onChange={(event) => mutateWorkflow((next) => { next.form.showStepNumbers = event.target.checked; })} /><span>Номери кроків</span></label>
                  <label className="check-field"><input type="checkbox" checked={workflow.showSummary} onChange={(event) => mutateWorkflow((next) => { next.form.showSummary = event.target.checked; })} /><span>Підсумок відповідей</span></label>
                </div>
              </div>
              <footer className="form-builder-actions">
                <button className="button button--primary" type="button" disabled={busy} onClick={() => void saveForm()}><Icon name="save" size={17} /> Зберегти</button>
                <button className="button button--secondary" type="button" disabled={busy || workflowHasErrors} onClick={() => void setFormPublished()}>Опублікувати</button>
                <button className="button button--secondary" type="button" disabled={busy} onClick={() => void setFormDisabled()}>Вимкнути</button>
                <button className="button button--secondary" type="button" disabled={busy} onClick={() => void duplicateSelected()}>Дублювати</button>
                <button className="button button--danger" type="button" disabled={busy} onClick={() => void archiveSelected()}>Архівувати</button>
              </footer>
            </section> : <section className="workflow-form-builder__canvas">
              <TradeInLogicEditor
                config={{ form: workflow } as TradeInConfig}
                mutate={mutateWorkflow}
                onUndo={undoWorkflow}
                canUndo={canUndoWorkflow}
                historyDepth={workflowHistoryDepth}
              />
            </section>}
          </div> : <>
          <section className="tool-panel forms-editor-tabs">
            <header className="tool-panel__header">
              <div><p className="eyebrow">Поточна форма</p><h2>{selectedForm.name}</h2></div>
              <span>{statusText(selectedForm.status)}</span>
            </header>
          </section>
          <div className="forms-simple-editor">
          <div className="forms-simple-editor__settings">
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
                className={`form-field-card${draggedFieldIndex === index ? ' form-field-card--dragging' : ''}${fieldDropTarget?.index === index ? ` form-field-card--drop-${fieldDropTarget.placement}` : ''}`}
                key={field.id || `field-${index}`}
                onDragOver={(event) => overField(event, index)}
                onDrop={(event) => dropField(event, index)}
                onDragEnd={() => { setDraggedFieldIndex(null); setFieldDropTarget(null); }}
              >
                <header className="form-field-card__bar">
                  <div className="form-field-card__title"><strong>{field.label}</strong><span>{fieldTypeLabels[field.type]}</span></div>
                  <span className="catalog-drag-handle" draggable={fields.length > 1} aria-disabled={fields.length <= 1} title="Перетягнути поле" onDragStart={(event) => startFieldDrag(event, index)}><Icon name="menu" size={18} /> Поле {index + 1}</span>
                </header>
                <div className="form-builder-grid">
                  <label className="field"><span>Назва</span><input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></label>
                  <div className="field"><span>Тип</span><StyledSelect value={field.type} options={fieldTypeOptions} onChange={(value) => updateFieldType(index, value)} ariaLabel={`Тип поля ${field.label}`} /></div>
                  <label className="field"><span>Placeholder</span><input value={field.placeholder} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></label>
                  <label className="field"><span>Підказка</span><input value={field.helpText} onChange={(event) => updateField(index, { helpText: event.target.value })} /></label>
                  {isChoiceFieldType(field.type) && <div className="form-options-editor form-builder-grid__wide">
                    <div><strong>Варіанти вибору</strong><button className="button button--secondary button--small" type="button" onClick={() => addFieldOption(index)}><Icon name="add" size={15} /> Додати варіант</button></div>
                    {(field.options.length ? field.options : [newOption(0)]).map((option, optionIndex) => <div className="form-option-row" key={`option-${optionIndex}`}>
                      <input value={option.label} onChange={(event) => updateFieldOption(index, optionIndex, event.target.value)} placeholder={`Варіант ${optionIndex + 1}`} />
                      <button className="icon-button icon-button--danger" type="button" disabled={field.options.length <= 1} onClick={() => removeFieldOption(index, optionIndex)} aria-label="Видалити варіант"><Icon name="delete" size={16} /></button>
                    </div>)}
                  </div>}
                  <label className="check-field"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} /><span>Обовʼязкове</span></label>
                  <label className="check-field"><input type="checkbox" checked={field.active} onChange={(event) => updateField(index, { active: event.target.checked })} /><span>Активне</span></label>
                  <label className="check-field form-builder-grid__wide"><input type="checkbox" checked={field.showInSummary} onChange={(event) => updateField(index, { showInSummary: event.target.checked })} /><span>Показувати в основній інформації заявки</span></label>
                </div>
                <footer><button className="button button--danger button--small" type="button" onClick={() => removeField(index)}><Icon name="delete" size={15} /> Видалити</button></footer>
              </article>)}
            </div>
          </section>

          </div>
          {simplePreviewInput && <aside className="forms-simple-editor__preview"><ApplicationFormLivePreview input={simplePreviewInput} /></aside>}
          </div>
        </>}
        </>}
      </div>
    </section>}

    {createModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeCreateModal();
    }}>
      <section className="modal forms-create-modal" role="dialog" aria-modal="true" aria-labelledby="forms-create-title">
        <header className="modal__header">
          <div><p className="eyebrow">Нова форма</p><h2 id="forms-create-title">Створити форму</h2></div>
          <button className="icon-button" type="button" onClick={closeCreateModal} disabled={createForm.isPending} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>
        <form onSubmit={(event) => void createNewForm(event)}>
          <div className="forms-create-modal__content">
            <div className="forms-create-modal__intro"><strong>Оберіть тип форми</strong><p>Тип визначає доступний редактор і спосіб побудови сценарію.</p></div>
            <div className="forms-create-modal__types" role="radiogroup" aria-label="Тип нової форми">
              <button className={newFormType === 'simple' ? 'forms-create-type is-selected' : 'forms-create-type'} type="button" role="radio" aria-checked={newFormType === 'simple'} onClick={() => setNewFormType('simple')}>
                <span><Icon name="formBuilder" size={22} /></span>
                <strong>Проста форма</strong>
                <small>Кастомні поля, тексти та оформлення форми.</small>
              </button>
              <button className={newFormType === 'workflow' ? 'forms-create-type is-selected' : 'forms-create-type'} type="button" role="radio" aria-checked={newFormType === 'workflow'} onClick={() => setNewFormType('workflow')}>
                <span><Icon name="variants" size={22} /></span>
                <strong>Покрокова форма</strong>
                <small>Ноди, умови та логічні переходи між кроками.</small>
              </button>
            </div>
            {newFormType && <label className="field forms-create-modal__name">
              <span>Назва форми</span>
              <input value={newFormName} onChange={(event) => setNewFormName(event.target.value)} maxLength={160} placeholder={newFormType === 'workflow' ? 'Наприклад, Оцінка Trade-in' : 'Наприклад, Передзамовлення iPhone'} required autoFocus />
              <small>Цю назву бачитимуть користувачі порталу в бібліотеці форм.</small>
            </label>}
          </div>
          <footer className="modal__footer forms-create-modal__footer">
            <button className="button button--secondary" type="button" onClick={closeCreateModal} disabled={createForm.isPending}>Скасувати</button>
            <button className="button button--primary" type="submit" disabled={!newFormType || !newFormName.trim() || createForm.isPending}>
              {createForm.isPending ? 'Створюємо…' : 'Створити'}
            </button>
          </footer>
        </form>
      </section>
    </div>}
  </div>;
}
