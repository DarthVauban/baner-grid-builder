import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogModificationParameter,
  CatalogModificationParameterInput,
  CatalogModificationValue
} from '../types/catalog';

const emptyValue = (): CatalogModificationValue => ({
  value: '',
  label: '',
  active: true,
  sortOrder: 0
});

const emptyParameter = (): CatalogModificationParameterInput => ({
  key: '',
  label: '',
  active: true,
  sortOrder: 0,
  values: [emptyValue()]
});

function parameterToInput(parameter: CatalogModificationParameter): CatalogModificationParameterInput {
  return {
    key: parameter.key,
    label: parameter.label,
    active: parameter.active,
    sortOrder: parameter.sortOrder,
    values: parameter.values.length ? parameter.values.map((value) => ({ ...value })) : [emptyValue()]
  };
}

export function CatalogModificationsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CatalogModificationParameterInput>(() => emptyParameter());

  const parameters = useQuery({
    queryKey: ['catalog-modification-parameters'],
    queryFn: api.catalog.modificationParameters
  });
  const selectedParameter = useMemo(
    () => (parameters.data || []).find((parameter) => parameter.id === selectedId) || null,
    [parameters.data, selectedId]
  );
  const saveParameter = useMutation({
    mutationFn: () => selectedParameter
      ? api.catalog.updateModificationParameter(selectedParameter.id, draft)
      : api.catalog.createModificationParameter(draft)
  });

  useEffect(() => {
    if (!parameters.data?.length || selectedId) return;
    const first = parameters.data[0];
    setSelectedId(first.id);
    setDraft(parameterToInput(first));
  }, [parameters.data, selectedId]);

  function selectParameter(parameter: CatalogModificationParameter) {
    setSelectedId(parameter.id);
    setDraft(parameterToInput(parameter));
  }

  function newParameter() {
    setSelectedId('');
    setDraft(emptyParameter());
  }

  function setField<K extends keyof CatalogModificationParameterInput>(key: K, value: CatalogModificationParameterInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setValue(index: number, patch: Partial<CatalogModificationValue>) {
    setDraft((current) => ({
      ...current,
      values: current.values.map((value, valueIndex) => (valueIndex === index ? { ...value, ...patch } : value))
    }));
  }

  function addValue() {
    setDraft((current) => ({
      ...current,
      values: [...current.values, { ...emptyValue(), sortOrder: current.values.length }]
    }));
  }

  function removeValue(index: number) {
    setDraft((current) => ({
      ...current,
      values: current.values.length <= 1 ? current.values : current.values.filter((_, valueIndex) => valueIndex !== index)
    }));
  }

  async function submit() {
    try {
      const saved = await saveParameter.mutateAsync();
      showToast(selectedParameter ? 'Параметр модифікації оновлено.' : 'Параметр модифікації створено.');
      setSelectedId(saved.id);
      setDraft(parameterToInput(saved));
      await queryClient.invalidateQueries({ queryKey: ['catalog-modification-parameters'] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти параметр модифікації.', 'error');
    }
  }

  return <div className="catalog-page catalog-modifications-page">
    <section className="task-toolbar">
      <div>
        <p className="eyebrow">Catalog setup</p>
        <h1>Модифікації товарів</h1>
      </div>
      <div className="task-toolbar__controls">
        <button className="button button--secondary" type="button" onClick={newParameter}><Icon name="add" /> Новий параметр</button>
        <button className="button button--primary" type="button" disabled={saveParameter.isPending || !draft.label.trim()} onClick={() => void submit()}><Icon name="save" /> Зберегти</button>
      </div>
    </section>

    <section className="catalog-template-layout">
      <aside className="catalog-template-list">
        {(parameters.data || []).map((parameter) => <button
          className={parameter.id === selectedId ? 'active' : ''}
          type="button"
          key={parameter.id}
          onClick={() => selectParameter(parameter)}
        >
          <strong>{parameter.label}</strong>
          <span>{parameter.values.length} значень · {parameter.active ? 'активний' : 'вимкнений'}</span>
        </button>)}
        {!parameters.isLoading && !parameters.data?.length && <div className="catalog-editor-notice">Параметрів ще немає. Створіть “Пам'ять”, “Колір” або інший параметр для перемикачів товару.</div>}
      </aside>

      <section className="catalog-editor-section catalog-template-editor">
        <header><h2>{selectedParameter ? 'Редагування параметра' : 'Новий параметр'}</h2><span>{draft.values.length} значень</span></header>
        <div className="catalog-editor-grid">
          <label className="field"><span>Назва параметра</span><input value={draft.label} onChange={(event) => setField('label', event.target.value)} placeholder="Об'єм пам'яті" maxLength={180} /></label>
          <label className="field"><span>Ключ</span><input value={draft.key} onChange={(event) => setField('key', event.target.value)} placeholder="auto якщо порожньо" maxLength={120} /></label>
          <label className="field"><span>Порядок</span><input type="number" value={draft.sortOrder} onChange={(event) => setField('sortOrder', Number(event.target.value || 0))} /></label>
          <label className="toggle-row"><input type="checkbox" checked={draft.active} onChange={(event) => setField('active', event.target.checked)} /> Активний параметр</label>
        </div>

        <div className="catalog-template-fields">
          <div className="catalog-template-fields__header">
            <h3>Значення параметра</h3>
            <button className="button button--secondary button--small" type="button" onClick={addValue}><Icon name="add" size={15} /> Значення</button>
          </div>
          {draft.values.map((value, index) => <article className="catalog-template-field" key={value.id || index}>
            <div className="catalog-editor-grid">
              <label className="field"><span>Назва</span><input value={value.label} onChange={(event) => setValue(index, { label: event.target.value })} placeholder="256 GB" maxLength={180} /></label>
              <label className="field"><span>Значення</span><input value={value.value} onChange={(event) => setValue(index, { value: event.target.value })} placeholder="256gb або auto" maxLength={160} /></label>
              <label className="field"><span>Порядок</span><input type="number" value={value.sortOrder} onChange={(event) => setValue(index, { sortOrder: Number(event.target.value || 0) })} /></label>
              <label className="toggle-row"><input type="checkbox" checked={value.active} onChange={(event) => setValue(index, { active: event.target.checked })} /> Активне значення</label>
            </div>
            <button className="icon-button" type="button" onClick={() => removeValue(index)} aria-label="Видалити значення"><Icon name="delete" /></button>
          </article>)}
        </div>
      </section>
    </section>
  </div>;
}
