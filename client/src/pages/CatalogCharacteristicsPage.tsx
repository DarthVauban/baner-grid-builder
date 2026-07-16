import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogCharacteristicField,
  CatalogCharacteristicFieldType,
  CatalogCharacteristicTemplate,
  CatalogCharacteristicTemplateInput
} from '../types/catalog';

const fieldTypeOptions: Array<{ value: CatalogCharacteristicFieldType; label: string }> = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'select', label: 'Список' },
  { value: 'multiselect', label: 'Мультивибір' },
  { value: 'boolean', label: 'Так/ні' },
  { value: 'color', label: 'Колір' }
];

const emptyField = (): CatalogCharacteristicField => ({
  key: '',
  label: '',
  type: 'text',
  unit: '',
  options: [],
  required: false,
  filterable: false,
  isModifier: false,
  sortOrder: 0
});

const emptyTemplate = (): CatalogCharacteristicTemplateInput => ({
  label: '',
  description: '',
  active: true,
  sortOrder: 0,
  fields: [emptyField()]
});

function optionsText(field: CatalogCharacteristicField) {
  return field.options.join('\n');
}

function parseOptions(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFieldOrder(fields: CatalogCharacteristicField[]) {
  return fields.map((field, sortOrder) => ({ ...field, sortOrder }));
}

function templateToInput(template: CatalogCharacteristicTemplate): CatalogCharacteristicTemplateInput {
  return {
    label: template.label,
    description: template.description,
    active: template.active,
    sortOrder: template.sortOrder,
    fields: template.fields.length ? template.fields.map((field) => ({ ...field })) : [emptyField()]
  };
}

export function CatalogCharacteristicsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CatalogCharacteristicTemplateInput>(() => emptyTemplate());
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [fieldDropTarget, setFieldDropTarget] = useState<{ index: number; placement: 'before' | 'after' } | null>(null);

  const templates = useQuery({
    queryKey: ['catalog-characteristic-templates'],
    queryFn: api.catalog.characteristicTemplates
  });
  const selectedTemplate = useMemo(
    () => (templates.data || []).find((template) => template.id === selectedId) || null,
    [selectedId, templates.data]
  );

  const saveTemplate = useMutation({
    mutationFn: () => selectedTemplate
      ? api.catalog.updateCharacteristicTemplate(selectedTemplate.id, draft)
      : api.catalog.createCharacteristicTemplate(draft)
  });

  useEffect(() => {
    if (!templates.data?.length || selectedId) return;
    const first = templates.data[0];
    setSelectedId(first.id);
    setDraft(templateToInput(first));
  }, [selectedId, templates.data]);

  function selectTemplate(template: CatalogCharacteristicTemplate) {
    setSelectedId(template.id);
    setDraft(templateToInput(template));
    setDraggedFieldIndex(null);
  }

  function newTemplate() {
    setSelectedId('');
    setDraft(emptyTemplate());
    setDraggedFieldIndex(null);
  }

  function setField<K extends keyof CatalogCharacteristicTemplateInput>(key: K, value: CatalogCharacteristicTemplateInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setTemplateField(index: number, patch: Partial<CatalogCharacteristicField>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field))
    }));
  }

  function setTemplateFieldType(index: number, type: CatalogCharacteristicFieldType) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) => {
        if (fieldIndex !== index) return field;
        const listType = type === 'select' || type === 'multiselect';
        return {
          ...field,
          type,
          unit: type === 'boolean' || type === 'color' ? '' : field.unit,
          options: listType ? field.options : []
        };
      })
    }));
  }

  function addField() {
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, { ...emptyField(), sortOrder: current.fields.length }]
    }));
  }

  function removeField(index: number) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.length <= 1 ? current.fields : normalizeFieldOrder(current.fields.filter((_, fieldIndex) => fieldIndex !== index))
    }));
  }

  function reorderField(fromIndex: number, toIndex: number) {
    setDraft((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.fields.length || toIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      const [field] = fields.splice(fromIndex, 1);
      fields.splice(toIndex, 0, field);
      return { ...current, fields: normalizeFieldOrder(fields) };
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

  async function submit() {
    try {
      const saved = await saveTemplate.mutateAsync();
      showToast(selectedTemplate ? 'Шаблон характеристик оновлено.' : 'Шаблон характеристик створено.');
      setSelectedId(saved.id);
      setDraft(templateToInput(saved));
      await queryClient.invalidateQueries({ queryKey: ['catalog-characteristic-templates'] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти шаблон.', 'error');
    }
  }

  return <div className="catalog-page catalog-characteristics-page">
    <section className="task-toolbar">
      <div>
        <p className="eyebrow">Catalog setup</p>
        <h1>Шаблони характеристик</h1>
      </div>
      <div className="task-toolbar__controls">
        <button className="button button--secondary" type="button" onClick={newTemplate}><Icon name="add" /> Новий шаблон</button>
        <button className="button button--primary" type="button" disabled={saveTemplate.isPending || !draft.label.trim()} onClick={() => void submit()}><Icon name="save" /> Зберегти</button>
      </div>
    </section>

    <section className="catalog-template-layout">
      <aside className="catalog-template-list">
        {(templates.data || []).map((template) => <button
          className={template.id === selectedId ? 'active' : ''}
          type="button"
          key={template.id}
          onClick={() => selectTemplate(template)}
        >
          <strong>{template.label}</strong>
          <span>{template.fields.length} полів · {template.active ? 'активний' : 'вимкнений'}</span>
        </button>)}
        {!templates.isLoading && !templates.data?.length && <div className="catalog-editor-notice">Шаблонів ще немає. Створіть перший шаблон для карток товарів.</div>}
      </aside>

      <section className="catalog-editor-section catalog-template-editor">
        <header><h2>{selectedTemplate ? 'Редагування шаблону' : 'Новий шаблон'}</h2><span>{draft.fields.length} полів</span></header>
        <div className="catalog-editor-grid">
          <label className="field"><span>Назва шаблону</span><input value={draft.label} onChange={(event) => setField('label', event.target.value)} maxLength={180} /></label>
          <label className="field"><span>Порядок</span><input type="number" value={draft.sortOrder} onChange={(event) => setField('sortOrder', Number(event.target.value || 0))} /></label>
          <label className="field catalog-editor-grid__wide"><span>Опис</span><textarea value={draft.description} onChange={(event) => setField('description', event.target.value)} maxLength={2000} /></label>
          <label className="toggle-row catalog-editor-grid__wide"><input type="checkbox" checked={draft.active} onChange={(event) => setField('active', event.target.checked)} /> Активний шаблон</label>
        </div>

        <div className="catalog-template-fields">
          <div className="catalog-template-fields__header">
            <h3>Поля шаблону</h3>
            <button className="button button--secondary button--small" type="button" onClick={addField}><Icon name="add" size={15} /> Поле</button>
          </div>
          {draft.fields.map((field, index) => <article
            className={`catalog-template-field${draggedFieldIndex === index ? ' catalog-template-field--dragging' : ''}${fieldDropTarget?.index === index ? ` catalog-template-field--drop-${fieldDropTarget.placement}` : ''}`}
            key={index}
            onDragOver={(event) => overField(event, index)}
            onDrop={(event) => dropField(event, index)}
            onDragEnd={() => { setDraggedFieldIndex(null); setFieldDropTarget(null); }}
          >
            <div className="catalog-template-field__bar">
              <span className="catalog-drag-handle" draggable={draft.fields.length > 1} aria-disabled={draft.fields.length <= 1} title="Перетягнути поле" onDragStart={(event) => startFieldDrag(event, index)}><Icon name="menu" size={18} /> Поле {index + 1}</span>
              <button className="icon-button" type="button" onClick={() => removeField(index)} aria-label="Видалити поле"><Icon name="delete" /></button>
            </div>
            <div className="catalog-editor-grid catalog-template-field__grid">
              <label className="field"><span>Назва поля</span><input value={field.label} onChange={(event) => setTemplateField(index, { label: event.target.value })} maxLength={180} /></label>
              <label className="field"><span>Ключ</span><input value={field.key} onChange={(event) => setTemplateField(index, { key: event.target.value })} placeholder="auto якщо порожньо" maxLength={120} /></label>
              <label className="field"><span>Тип</span><StyledSelect value={field.type} options={fieldTypeOptions} onChange={(value) => setTemplateFieldType(index, value as CatalogCharacteristicFieldType)} /></label>
              <label className="field"><span>Одиниця</span><input value={field.unit} onChange={(event) => setTemplateField(index, { unit: event.target.value })} placeholder="GB, %, mAh" maxLength={40} /></label>
              {(field.type === 'select' || field.type === 'multiselect') && <label className="field catalog-editor-grid__wide"><span>Опції</span><textarea value={optionsText(field)} onChange={(event) => setTemplateField(index, { options: parseOptions(event.target.value) })} placeholder="Кожна опція з нового рядка" /></label>}
              <label className="toggle-row"><input type="checkbox" checked={field.required} onChange={(event) => setTemplateField(index, { required: event.target.checked })} /> Обов'язкове</label>
              <label className="toggle-row"><input type="checkbox" checked={field.filterable} onChange={(event) => setTemplateField(index, { filterable: event.target.checked })} /> Для фільтрів</label>
              <label className="toggle-row"><input type="checkbox" checked={field.isModifier} onChange={(event) => setTemplateField(index, { isModifier: event.target.checked })} /> Модифікований параметр</label>
            </div>
          </article>)}
        </div>
      </section>
    </section>
  </div>;
}
