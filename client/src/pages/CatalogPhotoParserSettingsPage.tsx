import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogPhotoParserAdapter,
  CatalogPhotoParserAdapterInput,
  CatalogPhotoParserTestResult
} from '../types/catalog';

interface AdapterDraft extends CatalogPhotoParserAdapterInput {
  productUrl: string;
}

const emptyDraft = (): AdapterDraft => ({
  name: '',
  storeUrl: '',
  productUrl: '',
  gallerySelector: '',
  fallback: false
});

function inputSignature(draft: AdapterDraft) {
  return JSON.stringify({
    name: draft.name.trim(),
    storeUrl: draft.storeUrl.trim(),
    productUrl: draft.productUrl.trim(),
    gallerySelector: draft.gallerySelector.trim(),
    fallback: draft.fallback
  });
}

function adapterDraft(adapter: CatalogPhotoParserAdapter): AdapterDraft {
  return {
    id: adapter.id,
    name: adapter.name,
    storeUrl: adapter.storeUrl,
    productUrl: '',
    gallerySelector: adapter.gallerySelector,
    fallback: adapter.fallback
  };
}

export function CatalogPhotoParserSettingsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<AdapterDraft>(() => emptyDraft());
  const [testResult, setTestResult] = useState<CatalogPhotoParserTestResult | null>(null);
  const [validatedSignature, setValidatedSignature] = useState('');

  const adapters = useQuery({
    queryKey: ['catalog-photo-parser-adapters'],
    queryFn: api.catalog.photoParser.adapters
  });
  const builtIns = useMemo(
    () => (adapters.data || []).filter((adapter) => adapter.source === 'builtin'),
    [adapters.data]
  );
  const custom = useMemo(
    () => (adapters.data || []).filter((adapter) => adapter.source === 'custom'),
    [adapters.data]
  );
  const selected = useMemo(
    () => custom.find((adapter) => adapter.id === selectedId) || null,
    [custom, selectedId]
  );
  const testAdapter = useMutation({
    mutationFn: api.catalog.photoParser.testAdapter
  });
  const saveAdapter = useMutation({
    mutationFn: (input: CatalogPhotoParserAdapterInput) => selected
      ? api.catalog.photoParser.updateAdapter(selected.id, input)
      : api.catalog.photoParser.createAdapter(input)
  });
  const toggleAdapter = useMutation({
    mutationFn: api.catalog.photoParser.toggleAdapter
  });
  const deleteAdapter = useMutation({
    mutationFn: api.catalog.photoParser.removeAdapter
  });
  const busy = testAdapter.isPending || saveAdapter.isPending || toggleAdapter.isPending || deleteAdapter.isPending;
  const currentSignature = inputSignature(draft);
  const validated = Boolean(testResult && validatedSignature === currentSignature);

  useEffect(() => {
    if (selected) setDraft(adapterDraft(selected));
    else setDraft(emptyDraft());
    setTestResult(null);
    setValidatedSignature('');
  }, [selected]);

  function patchDraft(patch: Partial<AdapterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setTestResult(null);
    setValidatedSignature('');
  }

  async function runTest() {
    try {
      const result = await testAdapter.mutateAsync({
        id: selected?.id,
        name: draft.name,
        storeUrl: draft.storeUrl,
        productUrl: draft.productUrl,
        gallerySelector: draft.gallerySelector,
        fallback: draft.fallback
      });
      setTestResult(result);
      setValidatedSignature(currentSignature);
      showToast(`Селектор працює: знайдено ${result.selectorImages} фото.`, 'success');
    } catch (error) {
      setTestResult(null);
      setValidatedSignature('');
      showToast(error instanceof Error ? error.message : 'Не вдалося перевірити селектор.', 'error');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validated) {
      showToast('Спочатку успішно перевірте селектор на тестовій сторінці.', 'error');
      return;
    }
    try {
      const saved = await saveAdapter.mutateAsync({
        name: draft.name,
        storeUrl: draft.storeUrl,
        gallerySelector: draft.gallerySelector,
        fallback: draft.fallback
      });
      await queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-adapters'] });
      setSelectedId(saved.id);
      setValidatedSignature('');
      setTestResult(null);
      showToast('Налаштування магазину збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти магазин.', 'error');
    }
  }

  async function toggle(item: CatalogPhotoParserAdapter) {
    try {
      await toggleAdapter.mutateAsync(item.id);
      await queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-adapters'] });
      showToast(item.enabled ? 'Магазин вимкнено.' : 'Магазин увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити стан магазину.', 'error');
    }
  }

  async function remove(item: CatalogPhotoParserAdapter) {
    const approved = await confirm({
      title: `Видалити «${item.name}»?`,
      message: 'Парсер більше не застосовуватиме цей CSS-селектор. Системні магазини та вже завантажені фото не зміняться.',
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!approved) return;
    try {
      await deleteAdapter.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId('');
      await queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-adapters'] });
      showToast('Магазин видалено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити магазин.', 'error');
    }
  }

  return <div className="catalog-page catalog-photo-parser-settings">
    <section className="task-toolbar catalog-photo-parser-header">
      <div>
        <p className="eyebrow">Parser setup</p>
        <h1>Налаштування парсера</h1>
        <p>Системні адаптери підтримуються автоматично. Для іншого магазину додайте домен і CSS-селектор галереї.</p>
      </div>
      <div className="task-toolbar__controls">
        <button className="button button--secondary" type="button" onClick={() => setSelectedId('')}><Icon name="add" size={17} /> Новий магазин</button>
      </div>
    </section>

    <section className="catalog-photo-parser-builtins">
      <header>
        <div><h2>Системні магазини</h2><span>Готові адаптери, захищені від видалення</span></div>
        <strong>{builtIns.length}</strong>
      </header>
      <div>
        {builtIns.map((adapter) => <article key={adapter.id}>
          <span className="catalog-photo-parser-adapter-icon"><Icon name="storefront" size={19} /></span>
          <div><strong>{adapter.name}</strong><a href={adapter.storeUrl} target="_blank" rel="noreferrer">{adapter.host}</a></div>
          <span className="catalog-photo-parser-system-badge">Системний</span>
          <details>
            <summary>CSS-селектор</summary>
            <code>{adapter.gallerySelector}</code>
          </details>
        </article>)}
      </div>
    </section>

    <section className="catalog-photo-parser-settings__layout">
      <aside className="catalog-photo-parser-adapter-list">
        <header><h2>Мої магазини</h2><span>{custom.length}</span></header>
        <button className={!selectedId ? 'active' : ''} type="button" onClick={() => setSelectedId('')}>
          <span className="catalog-photo-parser-adapter-icon"><Icon name="add" size={18} /></span>
          <span><strong>Новий магазин</strong><small>Створити власний адаптер</small></span>
        </button>
        {custom.map((adapter) => <button
          className={adapter.id === selectedId ? 'active' : ''}
          type="button"
          key={adapter.id}
          onClick={() => setSelectedId(adapter.id)}
        >
          <span className="catalog-photo-parser-adapter-icon"><Icon name="storefront" size={18} /></span>
          <span><strong>{adapter.name}</strong><small>{adapter.host}</small></span>
          <i className={adapter.enabled ? 'is-enabled' : ''}>{adapter.enabled ? 'Увімк.' : 'Вимк.'}</i>
        </button>)}
        {!adapters.isLoading && !custom.length && <p>Користувацьких магазинів ще немає.</p>}
      </aside>

      <form className="catalog-photo-parser-adapter-editor" onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <p className="eyebrow">{selected ? 'Редагування' : 'Новий адаптер'}</p>
            <h2>{selected?.name || 'Додати магазин'}</h2>
          </div>
          {selected && <div className="catalog-photo-parser-adapter-editor__actions">
            <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => void toggle(selected)}>
              <Icon name={selected.enabled ? 'visibilityOff' : 'visibility'} size={15} /> {selected.enabled ? 'Вимкнути' : 'Увімкнути'}
            </button>
            <button className="button button--danger button--small" type="button" disabled={busy} onClick={() => void remove(selected)}>
              <Icon name="delete" size={15} /> Видалити
            </button>
          </div>}
        </header>

        <div className="catalog-photo-parser-adapter-form">
          <label className="field"><span>Назва магазину</span><input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} placeholder="Наприклад, Citrus" maxLength={80} required /></label>
          <label className="field"><span>Адреса магазину</span><input type="url" value={draft.storeUrl} onChange={(event) => patchDraft({ storeUrl: event.target.value })} placeholder="https://example.com" maxLength={500} required /></label>
          <label className="field catalog-photo-parser-adapter-form__wide">
            <span>CSS-селектор галереї товару</span>
            <textarea value={draft.gallerySelector} onChange={(event) => patchDraft({ gallerySelector: event.target.value })} placeholder=".product-gallery img" maxLength={1000} required />
            <small>Селектор має вказувати на зображення або на контейнери, всередині яких є теги img.</small>
          </label>
          <label className="toggle-row catalog-photo-parser-adapter-form__wide">
            <input type="checkbox" checked={draft.fallback} onChange={(event) => patchDraft({ fallback: event.target.checked })} />
            Якщо селектор порожній, додатково шукати фото універсальними правилами
          </label>
        </div>

        <section className="catalog-photo-parser-test">
          <header>
            <div><h3>Тест селектора</h3><span>Збереження доступне тільки після успішної перевірки поточних налаштувань.</span></div>
          </header>
          <div className="catalog-photo-parser-test__controls">
            <label className="field">
              <span>Посилання на тестовий товар</span>
              <input type="url" value={draft.productUrl} onChange={(event) => patchDraft({ productUrl: event.target.value })} placeholder={`${draft.storeUrl || 'https://example.com'}/product/...`} maxLength={4000} required />
            </label>
            <button className="button button--secondary" type="button" disabled={busy || !draft.name || !draft.storeUrl || !draft.productUrl || !draft.gallerySelector} onClick={() => void runTest()}>
              {testAdapter.isPending ? <span className="catalog-photo-parser-spinner" /> : <Icon name="search" size={16} />}
              {testAdapter.isPending ? 'Перевіряємо…' : 'Перевірити парсинг'}
            </button>
          </div>
          {testResult && validated && <div className="catalog-photo-parser-test__result">
            <header><span><Icon name="check" size={16} /></span><div><strong>Селектор працює</strong><small>{testResult.title || testResult.host} · {testResult.selectorImages} фото у селекторі</small></div></header>
            <div>
              {testResult.images.map((image) => <a href={image.sourceUrl} target="_blank" rel="noreferrer" key={image.sourceUrl}>
                <img src={image.preview} alt="" />
                <span>{image.width} × {image.height}</span>
              </a>)}
            </div>
            {testResult.errors.length > 0 && <p>Окремих фото пропущено: {testResult.errors.length}. Це не зупинить масову обробку.</p>}
          </div>}
        </section>

        <footer>
          <span className={validated ? 'is-valid' : ''}>
            <Icon name={validated ? 'check' : 'schedule'} size={15} />
            {validated ? 'Поточні налаштування перевірено' : 'Потрібна тестова перевірка'}
          </span>
          <button className="button button--primary" type="submit" disabled={busy || !validated}>
            <Icon name="save" size={16} /> {saveAdapter.isPending ? 'Зберігаємо…' : 'Зберегти магазин'}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
