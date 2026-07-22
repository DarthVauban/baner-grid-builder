import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../toast/ToastContext';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Ще не збережено';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

export function AdminIntegrationsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const integrations = useQuery({ queryKey: ['admin-integrations'], queryFn: api.admin.integrations });
  const saveTelegram = useMutation({ mutationFn: api.admin.saveTelegramIntegration });
  const telegram = integrations.data?.telegram;

  const [chatId, setChatId] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramTokenVisible, setTelegramTokenVisible] = useState(false);
  const [telegramError, setTelegramError] = useState('');

  useEffect(() => {
    if (!telegram) return;
    setChatId(telegram.chatId);
  }, [telegram]);

  async function submitTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramError('');
    try {
      await saveTelegram.mutateAsync({ chatId: chatId.trim(), token: telegramToken.trim() });
      setTelegramToken('');
      showToast('Telegram-бота підключено й перевірено.');
      await queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
    } catch (caught) {
      setTelegramError(caught instanceof Error ? caught.message : 'Не вдалося підключити Telegram.');
    }
  }

  const loadingError = integrations.error instanceof Error ? integrations.error.message : '';

  return (
    <div className="admin-page integrations-page">
      <header className="page-heading admin-page__heading integrations-heading">
        <div>
          <p className="eyebrow">Панель керування</p>
          <h1>Інтеграції</h1>
        </div>
        <p>Підключення Telegram-бота для службових повідомлень і резервних копій робочого простору.</p>
      </header>

      {integrations.isLoading && <div className="admin-list-state">Завантажуємо інтеграцію...</div>}
      {loadingError && <div className="admin-list-state admin-list-state--error">{loadingError}</div>}

      {!integrations.isLoading && !loadingError && <div className="integration-grid integration-grid--single">
        <section className="admin-section integration-card integration-card--telegram">
          <header className="integration-card__header">
            <span className="integration-card__icon integration-card__icon--telegram"><Icon name="send" size={20} /></span>
            <div>
              <p className="eyebrow">Службовий канал</p>
              <h2>Telegram</h2>
              <p>Бот надсилатиме резервні копії у вибраний особистий чат, групу або канал.</p>
            </div>
            <span className={telegram?.configured ? 'integration-status integration-status--ready' : 'integration-status'}>
              {telegram?.configured ? 'Підключено' : 'Не налаштовано'}
            </span>
          </header>

          <form className="integration-form integration-form--compact" onSubmit={submitTelegram}>
            {telegramError && <div className="form-message form-message--error integration-form__wide" role="alert">{telegramError}</div>}
            <label className="field">
              <span>ID чату або @канал</span>
              <input value={chatId} onChange={(event) => setChatId(event.target.value)} autoComplete="off" placeholder="-1001234567890" required />
              <small className="integration-field-hint">Не ID бота. Для закритого каналу використовуйте числовий ID у форматі -100…</small>
            </label>
            <label className="field">
              <span>{telegram?.configured ? 'Новий bot token (необов’язково)' : 'Bot token'}</span>
              <span className="password-field__control">
                <input type={telegramTokenVisible ? 'text' : 'password'} value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder={telegram?.configured ? 'Залиште порожнім, щоб не змінювати' : 'Токен від @BotFather'} />
                <button type="button" onClick={() => setTelegramTokenVisible((value) => !value)} aria-label="Показати або сховати токен"><Icon name={telegramTokenVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <div className="integration-card__footer integration-form__wide">
              <small>{telegram?.botUsername ? `Підключено @${telegram.botUsername} · ${formatDate(telegram.updatedAt)}` : 'Під час збереження бот і чат будуть перевірені'}</small>
              <button className="button button--primary button--compact" type="submit" disabled={!chatId.trim() || (!telegramToken.trim() && !telegram?.configured) || saveTelegram.isPending}>
                <Icon name="save" size={17} />{saveTelegram.isPending ? 'Перевіряємо...' : telegram?.configured ? 'Зберегти' : 'Підключити'}
              </button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  );
}
