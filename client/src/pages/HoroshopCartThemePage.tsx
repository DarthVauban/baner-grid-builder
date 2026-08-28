import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HoroshopCartThemePreview } from '../components/HoroshopCartThemePreview';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCartThemeId } from '../types/horoshop-cart-theme';
import '../styles/horoshop-cart-theme.css';

function formatDate(value: string | null) {
  if (!value) return 'Ще не публікувалося';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function HoroshopCartThemePage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settingsQuery = useQuery({
    queryKey: ['horoshop-cart-theme-settings'],
    queryFn: api.horoshopCartTheme.settings
  });
  const [selectedTheme, setSelectedTheme] = useState<HoroshopCartThemeId>('balanced-upsell');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const saveDraft = useMutation({ mutationFn: api.horoshopCartTheme.saveDraft });
  const publish = useMutation({ mutationFn: api.horoshopCartTheme.publish });
  const setEnabled = useMutation({ mutationFn: api.horoshopCartTheme.setEnabled });

  useEffect(() => {
    if (settingsQuery.data) setSelectedTheme(settingsQuery.data.settings.draftThemeId);
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading) {
    return <div className="cart-theme-tool-state">Завантажуємо налаштування кошика…</div>;
  }
  if (settingsQuery.isError || !settingsQuery.data) {
    return <div className="cart-theme-tool-state is-error">Не вдалося завантажити інструмент кошика.</div>;
  }

  const { settings, themes } = settingsQuery.data;
  const selected = themes.find((theme) => theme.id === selectedTheme) || themes[0];
  const isDirty = selectedTheme !== settings.draftThemeId;
  const busy = saveDraft.isPending || publish.isPending || setEnabled.isPending;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['horoshop-cart-theme-settings'] });
  }

  async function saveSelection() {
    try {
      await saveDraft.mutateAsync({ themeId: selectedTheme });
      await refresh();
      showToast('Чернетку оформлення кошика збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти оформлення.', 'error');
    }
  }

  async function publishSelection() {
    try {
      await publish.mutateAsync({ themeId: selectedTheme });
      await refresh();
      showToast('Оформлення кошика опубліковано й увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати оформлення.', 'error');
    }
  }

  async function toggleEnabled() {
    try {
      await setEnabled.mutateAsync(!settings.enabled);
      await refresh();
      showToast(settings.enabled ? 'Кастомне оформлення кошика вимкнено.' : 'Кастомне оформлення кошика увімкнено.', 'success');
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

  return <div className="cart-theme-tool-page">
    <header className="cart-theme-tool-heading">
      <div>
        <p className="eyebrow">Хорошоп · зовнішній вигляд</p>
        <h1>Кошик Хорошоп</h1>
        <p>Інструмент зменшує товарні рядки, розширює кошик і робить супутні товари помітною вітриною. Товари, ціни, кількість, рекомендації та оформлення замовлення залишаються під керуванням Хорошопа.</p>
      </div>
      <div className={`cart-theme-tool-status${settings.enabled ? ' is-active' : ''}`}>
        <span />
        <div><strong>{settings.enabled ? 'Оформлення активне' : 'Оформлення вимкнене'}</strong><small>{settings.storeDomain || 'Домен Хорошопа не підключено'}</small></div>
      </div>
    </header>

    <section className="cart-theme-tool-section">
      <header>
        <div><p className="eyebrow">Варіант 1 із 3</p><h2>Оберіть акцент кошика</h2><p>Усі варіанти зберігають штатну поведінку Horoshop. Змінюються ширина модального вікна, щільність замовлення та розмір рекомендованих карток.</p></div>
        {isDirty && <span className="cart-theme-tool-unsaved">Є незбережені зміни</span>}
      </header>
      <div className="cart-theme-grid" role="radiogroup" aria-label="Варіант оформлення кошика">
        {themes.map((theme) => <button
          className={`cart-theme-card${selectedTheme === theme.id ? ' is-selected' : ''}`}
          type="button"
          role="radio"
          aria-checked={selectedTheme === theme.id}
          onClick={() => setSelectedTheme(theme.id)}
          key={theme.id}
        >
          <HoroshopCartThemePreview themeId={theme.id} compact />
          <span className="cart-theme-card__copy">
            <span><strong>{theme.name}</strong>{theme.recommended && <em>Рекомендовано</em>}</span>
            <small>{theme.description}</small>
          </span>
          <i className="cart-theme-card__check"><Icon name="check" size={15} /></i>
        </button>)}
      </div>
    </section>

    <section className="cart-theme-tool-preview-section">
      <header>
        <div><p className="eyebrow">Живий перегляд</p><h2>{selected.name}</h2><p>{selected.description}</p></div>
        <div className="cart-theme-viewport-switch" aria-label="Розмір перегляду">
          <button className={viewport === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setViewport('desktop')}><Icon name="monitor" size={16} /> Десктоп</button>
          <button className={viewport === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setViewport('mobile')}><Icon name="phone" size={16} /> Мобільний</button>
        </div>
      </header>
      <div className="cart-theme-tool-preview-frame">
        <HoroshopCartThemePreview themeId={selectedTheme} viewport={viewport} />
      </div>
      <p className="cart-theme-tool-preview-note"><Icon name="visibility" size={15} /> Preview демонструє пропорції. На сайті адаптер використовує фактичну розмітку, товари та рекомендації Horoshop.</p>
    </section>

    <div className="cart-theme-tool-bottom-grid">
      <section className="cart-theme-tool-section cart-theme-install-card">
        <header><div><p className="eyebrow">Встановлення</p><h2>Один код для десктопа й мобільної версії</h2><p>Додайте код у Хорошоп один раз перед <code>&lt;/body&gt;</code>. Наступні публікації та вимкнення теми не потребують заміни коду.</p></div></header>
        <pre>{settings.embedCode}</pre>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbedCode()}><Icon name="copy" size={16} /> Копіювати код</button>
      </section>

      <section className="cart-theme-tool-section cart-theme-publish-card">
        <header><div><p className="eyebrow">Публікація</p><h2>Стан на сайті</h2></div></header>
        <dl>
          <div><dt>Опублікована тема</dt><dd>{themes.find((theme) => theme.id === settings.publishedThemeId)?.name || 'Немає'}</dd></div>
          <div><dt>Версія</dt><dd>{settings.publishedVersion || '—'}</dd></div>
          <div><dt>Остання публікація</dt><dd>{formatDate(settings.publishedAt)}</dd></div>
        </dl>
        <div className="cart-theme-publish-card__actions">
          <button className="button button--secondary" type="button" onClick={() => void saveSelection()} disabled={!isDirty || busy}><Icon name="save" size={16} /> Зберегти чернетку</button>
          <button className="button button--primary" type="button" onClick={() => void publishSelection()} disabled={busy}><Icon name="publication" size={16} /> Опублікувати й увімкнути</button>
          <button className="cart-theme-enable-button" type="button" onClick={() => void toggleEnabled()} disabled={!settings.publishedThemeId || busy}>{settings.enabled ? 'Тимчасово вимкнути оформлення' : 'Увімкнути опубліковане оформлення'}</button>
        </div>
      </section>
    </div>
  </div>;
}
