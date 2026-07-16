import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { CatalogBrand, CatalogBrandDirectory } from '../types/catalog';

type DirectoryDraft = Pick<CatalogBrandDirectory, 'label' | 'description' | 'active' | 'sortOrder'>;
type BrandDraft = Pick<CatalogBrand, 'label' | 'active'>;

const emptyDirectoryDraft = (): DirectoryDraft => ({
  label: '',
  description: '',
  active: true,
  sortOrder: 0
});

function compareByLabel<T extends { label: string }>(left: T, right: T) {
  return left.label.localeCompare(right.label, 'uk-UA', { sensitivity: 'base' });
}

function parseBrandLines(value: string) {
  const seen = new Set<string>();
  const labels: string[] = [];
  value.split(/\r?\n/).forEach((line) => {
    const label = line.replace(/\s+/g, ' ').trim();
    const key = label.toLocaleLowerCase('uk-UA');
    if (!label || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });
  return labels;
}

function BulkBrandsModal({
  directory,
  busy,
  onClose,
  onSubmit
}: {
  directory: CatalogBrandDirectory;
  busy: boolean;
  onClose: () => void;
  onSubmit: (labels: string[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const labels = useMemo(() => parseBrandLines(text), [text]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!labels.length) return;
    await onSubmit(labels);
  }

  return <div className="modal-backdrop" role="presentation">
    <form className="modal catalog-brands-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-brands-bulk-title" onSubmit={(event) => void submit(event)}>
      <header className="modal__header">
        <div>
          <p className="eyebrow">Масове додавання</p>
          <h2 id="catalog-brands-bulk-title">{directory.label}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      <div className="catalog-brands-bulk-modal__content">
        <label className="field">
          <span>Назви брендів</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'Apple\nSamsung\nXiaomi'}
            autoFocus
          />
        </label>
        <div className="catalog-editor-notice">
          Розпізнано {labels.length} {labels.length === 1 ? 'назву' : 'назв'}. Дублікати в цьому списку буде пропущено.
        </div>
      </div>
      <footer className="modal__footer catalog-brands-bulk-modal__footer">
        <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
        <button className="button button--primary" type="submit" disabled={busy || !labels.length}><Icon name="add" /> Додати список</button>
      </footer>
    </form>
  </div>;
}

export function CatalogBrandsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [directoryDraft, setDirectoryDraft] = useState<DirectoryDraft>(() => emptyDirectoryDraft());
  const [newBrandLabel, setNewBrandLabel] = useState('');
  const [brandDrafts, setBrandDrafts] = useState<Record<string, BrandDraft>>({});
  const [bulkOpen, setBulkOpen] = useState(false);

  const directories = useQuery({
    queryKey: ['catalog-brand-directories'],
    queryFn: api.catalog.brandDirectories
  });
  const selectedDirectory = useMemo(
    () => (directories.data || []).find((directory) => directory.id === selectedId) || null,
    [directories.data, selectedId]
  );
  const sortedDirectories = useMemo(
    () => [...(directories.data || [])].sort(compareByLabel),
    [directories.data]
  );
  const brands = useQuery({
    queryKey: ['catalog-brands', selectedId],
    queryFn: () => api.catalog.brands({ directoryId: selectedId }),
    enabled: Boolean(selectedId)
  });
  const sortedBrands = useMemo(
    () => [...(brands.data || [])].sort(compareByLabel),
    [brands.data]
  );

  const saveDirectory = useMutation({
    mutationFn: (draft: DirectoryDraft) => selectedDirectory
      ? api.catalog.updateBrandDirectory(selectedDirectory.id, draft)
      : api.catalog.createBrandDirectory(draft)
  });
  const createBrand = useMutation({ mutationFn: api.catalog.createBrand });
  const updateBrand = useMutation({
    mutationFn: ({ brand, draft }: { brand: CatalogBrand; draft: BrandDraft }) => api.catalog.updateBrand(brand.id, {
      directoryId: brand.directoryId,
      label: draft.label,
      active: draft.active,
      sortOrder: brand.sortOrder
    })
  });
  const bulkCreateBrands = useMutation({ mutationFn: api.catalog.bulkCreateBrands });
  const busy = saveDirectory.isPending || createBrand.isPending || updateBrand.isPending || bulkCreateBrands.isPending;

  useEffect(() => {
    if (selectedId || !sortedDirectories.length) return;
    setSelectedId(sortedDirectories[0].id);
  }, [selectedId, sortedDirectories]);

  useEffect(() => {
    if (selectedDirectory) {
      setDirectoryDraft({
        label: selectedDirectory.label,
        description: selectedDirectory.description,
        active: selectedDirectory.active,
        sortOrder: selectedDirectory.sortOrder
      });
    } else {
      setDirectoryDraft(emptyDirectoryDraft());
    }
    setNewBrandLabel('');
  }, [selectedDirectory]);

  useEffect(() => {
    const next: Record<string, BrandDraft> = {};
    sortedBrands.forEach((brand) => {
      next[brand.id] = { label: brand.label, active: brand.active };
    });
    setBrandDrafts(next);
  }, [sortedBrands]);

  async function refreshBrands(directoryId = selectedId) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-brand-directories'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-brands'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
      directoryId ? queryClient.invalidateQueries({ queryKey: ['catalog-brands', directoryId] }) : Promise.resolve()
    ]);
  }

  function newDirectory() {
    setSelectedId('');
    setDirectoryDraft(emptyDirectoryDraft());
    setBrandDrafts({});
  }

  async function submitDirectory(event: FormEvent) {
    event.preventDefault();
    if (!directoryDraft.label.trim()) return;
    const saved = await saveDirectory.mutateAsync(directoryDraft);
    setSelectedId(saved.id);
    await refreshBrands(saved.id);
    showToast('Довідник збережено.', 'success');
  }

  async function submitBrand(event: FormEvent) {
    event.preventDefault();
    if (!selectedDirectory || !newBrandLabel.trim()) return;
    await createBrand.mutateAsync({
      directoryId: selectedDirectory.id,
      label: newBrandLabel,
      active: true,
      sortOrder: 0
    });
    setNewBrandLabel('');
    await refreshBrands(selectedDirectory.id);
    showToast('Бренд додано.', 'success');
  }

  async function saveBrand(brand: CatalogBrand) {
    const draft = brandDrafts[brand.id];
    if (!draft?.label.trim()) return;
    await updateBrand.mutateAsync({ brand, draft });
    await refreshBrands(brand.directoryId);
    showToast('Бренд оновлено.', 'success');
  }

  async function submitBulk(labels: string[]) {
    if (!selectedDirectory) return;
    const result = await bulkCreateBrands.mutateAsync({ directoryId: selectedDirectory.id, labels });
    await refreshBrands(selectedDirectory.id);
    setBulkOpen(false);
    const skipped = result.skipped.length ? ` Пропущено дублікатів: ${result.skipped.length}.` : '';
    showToast(`Додано брендів: ${result.created.length}.${skipped}`, 'success');
  }

  function setBrandDraft(id: string, patch: Partial<BrandDraft>) {
    setBrandDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch }
    }));
  }

  return <div className="catalog-page catalog-brands-page">
    <section className="task-toolbar">
      <div>
        <p className="eyebrow">Catalog setup</p>
        <h1>Довідники брендів</h1>
      </div>
      <div className="task-toolbar__controls">
        <button className="button button--secondary" type="button" onClick={newDirectory}><Icon name="add" /> Новий довідник</button>
      </div>
    </section>

    <section className="catalog-brand-directory-layout">
      <aside className="catalog-template-list catalog-brand-directory-list">
        {sortedDirectories.map((directory) => <button
          className={directory.id === selectedId ? 'active' : ''}
          type="button"
          key={directory.id}
          onClick={() => setSelectedId(directory.id)}
        >
          <strong>{directory.label}</strong>
          <span>{directory.brandCount} брендів · {directory.active ? 'активний' : 'вимкнений'}</span>
        </button>)}
        {!directories.isLoading && !sortedDirectories.length && <div className="catalog-editor-notice">Створіть перший довідник брендів.</div>}
      </aside>

      <section className="catalog-editor-section catalog-brand-directory-editor">
        <form className="catalog-brand-directory-form" onSubmit={(event) => void submitDirectory(event)}>
          <header>
            <h2>{selectedDirectory ? 'Редагування довідника' : 'Новий довідник'}</h2>
            <button className="button button--primary button--small" type="submit" disabled={busy || !directoryDraft.label.trim()}><Icon name="save" size={15} /> Зберегти</button>
          </header>
          <div className="catalog-editor-grid">
            <label className="field"><span>Назва довідника</span><input value={directoryDraft.label} onChange={(event) => setDirectoryDraft((current) => ({ ...current, label: event.target.value }))} maxLength={180} /></label>
            <label className="field"><span>Порядок</span><input type="number" value={directoryDraft.sortOrder} onChange={(event) => setDirectoryDraft((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))} /></label>
            <label className="field catalog-editor-grid__wide"><span>Опис</span><textarea value={directoryDraft.description} onChange={(event) => setDirectoryDraft((current) => ({ ...current, description: event.target.value }))} maxLength={2000} /></label>
            <label className="toggle-row catalog-editor-grid__wide"><input type="checkbox" checked={directoryDraft.active} onChange={(event) => setDirectoryDraft((current) => ({ ...current, active: event.target.checked }))} /> Активний довідник</label>
          </div>
        </form>

        <section className="catalog-brand-items">
          <header>
            <div>
              <h3>Бренди</h3>
              <span>{selectedDirectory ? `${sortedBrands.length} у довіднику` : 'Збережіть довідник, щоб додавати бренди'}</span>
            </div>
            <button className="button button--secondary button--small" type="button" disabled={!selectedDirectory || busy} onClick={() => setBulkOpen(true)}><Icon name="upload" size={15} /> Масове додавання</button>
          </header>

          {selectedDirectory && <form className="catalog-brand-add-form" onSubmit={(event) => void submitBrand(event)}>
            <label className="field"><span>Новий бренд</span><input value={newBrandLabel} onChange={(event) => setNewBrandLabel(event.target.value)} placeholder="Apple" maxLength={160} /></label>
            <button className="button button--primary" type="submit" disabled={busy || !newBrandLabel.trim()}><Icon name="add" /> Додати</button>
          </form>}

          {selectedDirectory ? <div className="catalog-brand-list">
            {sortedBrands.map((brand) => {
              const draft = brandDrafts[brand.id] || { label: brand.label, active: brand.active };
              const changed = draft.label !== brand.label || draft.active !== brand.active;
              return <article className="catalog-brand-row" key={brand.id}>
                <label className="field"><span>Назва</span><input value={draft.label} onChange={(event) => setBrandDraft(brand.id, { label: event.target.value })} maxLength={160} /></label>
                <label className="toggle-row"><input type="checkbox" checked={draft.active} onChange={(event) => setBrandDraft(brand.id, { active: event.target.checked })} /> Активний</label>
                <button className="button button--secondary button--small" type="button" disabled={busy || !changed || !draft.label.trim()} onClick={() => void saveBrand(brand)}><Icon name="save" size={15} /> Зберегти</button>
              </article>;
            })}
            {!brands.isLoading && !sortedBrands.length && <div className="empty-state">
              <div className="empty-state__icon"><Icon name="savedBanners" size={28} /></div>
              <h2>Брендів ще немає</h2>
              <p>Додайте бренд вручну або вставте список назв через масове додавання.</p>
            </div>}
          </div> : <div className="catalog-editor-notice">Спершу збережіть новий довідник.</div>}
        </section>
      </section>
    </section>

    {selectedDirectory && bulkOpen && <BulkBrandsModal
      directory={selectedDirectory}
      busy={bulkCreateBrands.isPending}
      onClose={() => setBulkOpen(false)}
      onSubmit={submitBulk}
    />}
  </div>;
}
