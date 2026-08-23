import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HoroshopCatalogMenuPreview } from '../components/HoroshopCatalogMenuPreview';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCatalogMenuThemeId } from '../types/horoshop-catalog-menu';
import '../styles/horoshop-catalog-menu.css';

function formatDate(value: string | null) {
  if (!value) return 'Ще не публікувалося';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function HoroshopCatalogMenuPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({
    queryKey: ['horoshop-catalog-menu-settings'],
    queryFn: api.horoshopCatalogMenu.settings
  });
  const [selectedTheme, setSelectedTheme] = useState<HoroshopCatalogMenuThemeId>('compact-columns');
  const [viewport, setViewport] = useState<'laptop' | 'desktop'>('laptop');
  const saveDraft = useMutation({ mutationFn: api.horoshopCatalogMenu.saveDraft });
  const publish = useMutation({ mutationFn: api.horoshopCatalogMenu.publish });
  const setEnabled = useMutation({ mutationFn: api.horoshopCatalogMenu.setEnabled });

  useEffect(() => {
    if (settingsQuery.data) setSelectedTheme(settingsQuery.data.settings.draftThemeId);
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading) {
    return <div className="catalog-menu-tool-state">Завантажуємо налаштування меню…</div>;
  }
  if (settingsQuery.isError || !settingsQuery.data) {
    return <div className="catalog-menu-tool-state is-error">Не вдалося завантажити інструмент меню каталогу.</div>;
  }

  const { settings, themes } = settingsQuery.data;
  const selected = themes.find((theme) => theme.id === selectedTheme) || themes[0];
  const isDirty = selectedTheme !== settings.draftThemeId;
  const busy = saveDraft.isPending || publish.isPending || setEnabled.isPending;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['horoshop-catalog-menu-settings'] });
  }

  async function saveSelection() {
    try {
      await saveDraft.mutateAsync(selectedTheme);
      await refresh();
      showToast('Чернетку оформлення збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти оформлення.', 'error');
    }
  }

  async function publishSelection() {
    try {
      await publish.mutateAsync(selectedTheme);
      await refresh();
      showToast('Оформлення опубліковано й увімкнено на сайті.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати оформлення.', 'error');
    }
  }

  async function toggleEnabled() {
    try {
      await setEnabled.mutateAsync(!settings.enabled);
      await refresh();
      showToast(settings.enabled ? 'Кастомне оформлення вимкнено.' : 'Кастомне оформлення увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити стан оформлення.', 'error');
    }
  }

  async function copyEmbedCode() {
    try {
      await navigator.clipboard.writeText(settings.embedCode);
      showToast('Код встановлення скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  return <div className="catalog-menu-tool-page">
    <header className="catalog-menu-tool-heading">
      <div>
        <p className="eyebrow">Хорошоп · зовнішній вигляд</p>
        <h1>Меню каталогу</h1>
        <p>Інструмент оформлює наявне меню категорій Хорошоп. Категорії, порядок, посилання та іконки залишаються під керуванням Хорошопа.</p>
      </div>
      <div className={`catalog-menu-tool-status${settings.enabled ? ' is-active' : ''}`}>
        <span />
        <div><strong>{settings.enabled ? 'Оформлення активне' : 'Оформлення вимкнене'}</strong><small>{settings.storeDomain || 'Домен Хорошопа не підключено'}</small></div>
      </div>
    </header>

    <section className="catalog-menu-tool-section">
      <header>
        <div><p className="eyebrow">Варіант 1 із 3</p><h2>Оберіть структуру оформлення</h2><p>Усі варіанти використовують те саме дерево Хорошопа. Змінюються лише щільність, колонки та групування.</p></div>
        {isDirty && <span className="catalog-menu-tool-unsaved">Є незбережений вибір</span>}
      </header>
      <div className="catalog-menu-theme-grid" role="radiogroup" aria-label="Варіант оформлення каталогу">
        {themes.map((theme) => <button
          className={`catalog-menu-theme-card${selectedTheme === theme.id ? ' is-selected' : ''}`}
          type="button"
          role="radio"
          aria-checked={selectedTheme === theme.id}
          onClick={() => setSelectedTheme(theme.id)}
          key={theme.id}
        >
          <HoroshopCatalogMenuPreview themeId={theme.id} compact />
          <span className="catalog-menu-theme-card__copy">
            <span><strong>{theme.name}</strong>{theme.recommended && <em>Рекомендовано</em>}</span>
            <small>{theme.description}</small>
          </span>
          <i className="catalog-menu-theme-card__check"><Icon name="check" size={15} /></i>
        </button>)}
      </div>
    </section>

    <section className="catalog-menu-tool-preview-section">
      <header>
        <div><p className="eyebrow">Живий перегляд</p><h2>{selected.name}</h2><p>{selected.description}</p></div>
        <div className="catalog-menu-viewport-switch" aria-label="Розмір перегляду">
          <button className={viewport === 'laptop' ? 'is-active' : ''} type="button" onClick={() => setViewport('laptop')}><Icon name="monitor" size={16} /> Ноутбук</button>
          <button className={viewport === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setViewport('desktop')}><Icon name="fullscreen" size={16} /> Десктоп</button>
        </div>
      </header>
      <div className="catalog-menu-tool-preview-frame">
        <HoroshopCatalogMenuPreview themeId={selectedTheme} viewport={viewport} />
      </div>
      <p className="catalog-menu-tool-preview-note"><Icon name="visibility" size={15} /> Назви у preview демонстраційні. На сайті скрипт використовує фактичні назви, іконки та посилання Хорошопа.</p>
    </section>

    <div className="catalog-menu-tool-bottom-grid">
      <section className="catalog-menu-tool-section catalog-menu-install-card">
        <header><div><p className="eyebrow">Встановлення</p><h2>Один код для всіх тем</h2><p>Додайте код у Хорошоп один раз перед <code>&lt;/body&gt;</code>. Наступні публікації не потребують заміни коду.</p></div></header>
        <pre>{settings.embedCode}</pre>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbedCode()}><Icon name="copy" size={16} /> Копіювати код</button>
      </section>

      <section className="catalog-menu-tool-section catalog-menu-publish-card">
        <header><div><p className="eyebrow">Публікація</p><h2>Стан на сайті</h2></div></header>
        <dl>
          <div><dt>Опублікована тема</dt><dd>{themes.find((theme) => theme.id === settings.publishedThemeId)?.name || 'Немає'}</dd></div>
          <div><dt>Версія</dt><dd>{settings.publishedVersion || '—'}</dd></div>
          <div><dt>Остання публікація</dt><dd>{formatDate(settings.publishedAt)}</dd></div>
        </dl>
        <div className="catalog-menu-publish-card__actions">
          <button className="button button--secondary" type="button" onClick={() => void saveSelection()} disabled={!isDirty || busy}><Icon name="save" size={16} /> Зберегти чернетку</button>
          <button className="button button--primary" type="button" onClick={() => void publishSelection()} disabled={busy}><Icon name="publication" size={16} /> Опублікувати й увімкнути</button>
          <button className="catalog-menu-enable-button" type="button" onClick={() => void toggleEnabled()} disabled={!settings.publishedThemeId || busy}>{settings.enabled ? 'Тимчасово вимкнути оформлення' : 'Увімкнути опубліковане оформлення'}</button>
        </div>
      </section>
    </div>
  </div>;
}
