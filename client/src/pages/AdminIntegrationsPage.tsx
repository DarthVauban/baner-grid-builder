import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../toast/ToastContext';

export function AdminIntegrationsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const integrations = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: api.admin.integrations
  });
  const saveMailtrap = useMutation({
    mutationFn: api.admin.saveMailtrapIntegration
  });
  const mailtrap = integrations.data?.mailtrap;
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('MT Panel');
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mailtrap) return;
    setSenderEmail(mailtrap.senderEmail);
    setSenderName(mailtrap.senderName || 'MT Panel');
  }, [mailtrap]);

  const updatedAt = useMemo(() => {
    if (!mailtrap?.updatedAt) return '';
    return new Intl.DateTimeFormat('uk-UA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(mailtrap.updatedAt));
  }, [mailtrap?.updatedAt]);

  const canSubmit = Boolean(
    senderEmail.trim()
    && senderName.trim()
    && (token.trim() || mailtrap?.configured)
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    try {
      await saveMailtrap.mutateAsync({
        senderEmail: senderEmail.trim(),
        senderName: senderName.trim(),
        token: token.trim()
      });
      setToken('');
      showToast('Інтеграцію Mailtrap збережено.');
      await queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося зберегти інтеграцію.');
    }
  }

  return (
    <div className="admin-page integrations-page">
      <header className="page-heading admin-page__heading">
        <p className="eyebrow">Панель керування</p>
        <h1>Інтеграції</h1>
        <p>Підключайте службові токени, які система використовуватиме для зовнішніх сервісів.</p>
      </header>

      <section className="admin-section integration-panel">
        <header className="admin-section__header">
          <div>
            <p className="eyebrow">Email</p>
            <h2>Mailtrap</h2>
            <p>Відправник для кодів підтвердження реєстрації та майбутніх сервісних листів.</p>
          </div>
          <span className={mailtrap?.configured ? 'integration-status integration-status--ready' : 'integration-status'}>
            {mailtrap?.configured ? 'Підключено' : 'Не налаштовано'}
          </span>
        </header>

        {integrations.isLoading && <div className="admin-list-state">Завантажуємо інтеграції...</div>}
        {integrations.isError && <div className="admin-list-state admin-list-state--error">{integrations.error instanceof Error ? integrations.error.message : 'Не вдалося завантажити інтеграції.'}</div>}

        {!integrations.isLoading && !integrations.isError && (
          <form className="integration-form" onSubmit={submit}>
            {error && <div className="form-message form-message--error integration-form__wide" role="alert">{error}</div>}

            <label className="field">
              <span>Email відправника</span>
              <input
                type="email"
                value={senderEmail}
                onChange={(event) => setSenderEmail(event.target.value)}
                autoComplete="off"
                placeholder="hello@mt-panel.sbs"
                required
              />
            </label>

            <label className="field">
              <span>Назва відправника</span>
              <input
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                autoComplete="off"
                maxLength={120}
                placeholder="MT Panel"
                required
              />
            </label>

            <label className="field integration-form__wide">
              <span>{mailtrap?.configured ? 'Новий API token' : 'Mailtrap API token'}</span>
              <span className="password-field__control">
                <input
                  type={tokenVisible ? 'text' : 'password'}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={mailtrap?.configured ? 'Залиште порожнім, щоб не змінювати токен' : 'Вставте токен Mailtrap'}
                />
                <button type="button" onClick={() => setTokenVisible((value) => !value)} aria-label={tokenVisible ? 'Сховати токен' : 'Показати токен'}>
                  <Icon name={tokenVisible ? 'visibilityOff' : 'visibility'} size={18} />
                </button>
              </span>
            </label>

            <div className="integration-meta integration-form__wide">
              <span><strong>Домен</strong><small>{senderEmail.includes('@') ? senderEmail.split('@')[1] : mailtrap?.domain || 'Не визначено'}</small></span>
              <span><strong>Оновлено</strong><small>{updatedAt || 'Ще не збережено'}</small></span>
              <span><strong>Секрет</strong><small>{mailtrap?.configured ? 'Збережено зашифрованим' : 'Очікує токен'}</small></span>
            </div>

            <div className="integration-form__actions integration-form__wide">
              <button className="button button--primary" type="submit" disabled={!canSubmit || saveMailtrap.isPending}>
                <Icon name="save" size={18} />
                {saveMailtrap.isPending ? 'Зберігаємо...' : 'Зберегти інтеграцію'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
