import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../toast/ToastContext';

type ActiveIntegration = 'mailtrap' | 'telegram' | null;

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
  const saveMailtrap = useMutation({ mutationFn: api.admin.saveMailtrapIntegration });
  const saveTelegram = useMutation({ mutationFn: api.admin.saveTelegramIntegration });
  const mailtrap = integrations.data?.mailtrap;
  const telegram = integrations.data?.telegram;

  const [activeIntegration, setActiveIntegration] = useState<ActiveIntegration>(null);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('MT Panel');
  const [mailtrapToken, setMailtrapToken] = useState('');
  const [mailtrapTokenVisible, setMailtrapTokenVisible] = useState(false);
  const [chatId, setChatId] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramTokenVisible, setTelegramTokenVisible] = useState(false);
  const [mailtrapError, setMailtrapError] = useState('');
  const [telegramError, setTelegramError] = useState('');

  function openMailtrap() {
    setSenderEmail(mailtrap?.senderEmail || '');
    setSenderName(mailtrap?.senderName || 'MT Panel');
    setMailtrapToken(mailtrap?.token || '');
    setMailtrapTokenVisible(false);
    setMailtrapError('');
    setActiveIntegration('mailtrap');
  }

  function openTelegram() {
    setChatId(telegram?.chatId || '');
    setTelegramToken(telegram?.token || '');
    setTelegramTokenVisible(false);
    setTelegramError('');
    setActiveIntegration('telegram');
  }

  function closeModal() {
    if (saveMailtrap.isPending || saveTelegram.isPending) return;
    setActiveIntegration(null);
  }

  async function submitMailtrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMailtrapError('');
    try {
      await saveMailtrap.mutateAsync({
        senderEmail: senderEmail.trim(),
        senderName: senderName.trim(),
        token: mailtrapToken.trim()
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      showToast('Інтеграцію Mailtrap збережено.');
      setActiveIntegration(null);
    } catch (caught) {
      setMailtrapError(caught instanceof Error ? caught.message : 'Не вдалося зберегти Mailtrap.');
    }
  }

  async function submitTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramError('');
    try {
      await saveTelegram.mutateAsync({ chatId: chatId.trim(), token: telegramToken.trim() });
      await queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });
      showToast('Telegram-бота підключено й перевірено.');
      setActiveIntegration(null);
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
        <p>Підключення зовнішніх сервісів для службових повідомлень і резервних копій робочого простору.</p>
      </header>

      {integrations.isLoading && <div className="admin-list-state">Завантажуємо інтеграції...</div>}
      {loadingError && <div className="admin-list-state admin-list-state--error">{loadingError}</div>}

      {!integrations.isLoading && !loadingError && <div className="integration-grid">
        <button
          className="integration-tile"
          type="button"
          onClick={openMailtrap}
          aria-haspopup="dialog"
          aria-label={`Відкрити налаштування Mailtrap. ${mailtrap?.configured ? 'Підключено' : 'Не налаштовано'}`}
        >
          <span className="integration-tile__icon"><Icon name="integrations" size={24} /></span>
          <strong>Mailtrap</strong>
        </button>

        <button
          className="integration-tile"
          type="button"
          onClick={openTelegram}
          aria-haspopup="dialog"
          aria-label={`Відкрити налаштування Telegram. ${telegram?.configured ? 'Підключено' : 'Не налаштовано'}`}
        >
          <span className="integration-tile__icon integration-tile__icon--telegram"><Icon name="send" size={24} /></span>
          <strong>Telegram</strong>
        </button>
      </div>}

      {activeIntegration === 'mailtrap' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <section className="modal integration-modal" role="dialog" aria-modal="true" aria-labelledby="mailtrap-integration-title">
          <header className="modal__header integration-modal__header">
            <div className="integration-modal__title">
              <span className="integration-card__icon"><Icon name="integrations" size={20} /></span>
              <div><p className="eyebrow">Email</p><h2 id="mailtrap-integration-title">Mailtrap</h2></div>
            </div>
            <div className="integration-modal__header-actions">
              <span className={mailtrap?.configured ? 'integration-status integration-status--ready' : 'integration-status'}>
                {mailtrap?.configured ? 'Підключено' : 'Не налаштовано'}
              </span>
              <button className="icon-button" type="button" onClick={closeModal} aria-label="Закрити"><Icon name="close" size={20} /></button>
            </div>
          </header>

          <form className="integration-form integration-modal__form" onSubmit={submitMailtrap}>
            {mailtrapError && <div className="form-message form-message--error integration-form__wide" role="alert">{mailtrapError}</div>}
            <label className="field">
              <span>Email відправника</span>
              <input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} autoComplete="off" placeholder="hello@mt-panel.sbs" required autoFocus />
            </label>
            <label className="field">
              <span>Назва відправника</span>
              <input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} placeholder="MT Panel" required />
            </label>
            <label className="field integration-form__wide">
              <span>Mailtrap API token</span>
              <span className="password-field__control">
                <input type={mailtrapTokenVisible ? 'text' : 'password'} value={mailtrapToken} onChange={(event) => setMailtrapToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Вставте токен Mailtrap" required />
                <button type="button" onClick={() => setMailtrapTokenVisible((value) => !value)} aria-label={mailtrapTokenVisible ? 'Сховати Mailtrap API token' : 'Показати Mailtrap API token'}><Icon name={mailtrapTokenVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <footer className="modal__footer integration-modal__footer integration-form__wide">
              <small>{mailtrap?.updatedAt ? `Оновлено ${formatDate(mailtrap.updatedAt)}` : 'Ще не збережено'}</small>
              <button className="button button--secondary" type="button" onClick={closeModal}>Скасувати</button>
              <button className="button button--primary" type="submit" disabled={!senderEmail.trim() || !senderName.trim() || !mailtrapToken.trim() || saveMailtrap.isPending}>
                <Icon name="save" size={17} />{saveMailtrap.isPending ? 'Зберігаємо...' : 'Зберегти'}
              </button>
            </footer>
          </form>
        </section>
      </div>}

      {activeIntegration === 'telegram' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <section className="modal integration-modal" role="dialog" aria-modal="true" aria-labelledby="telegram-integration-title">
          <header className="modal__header integration-modal__header">
            <div className="integration-modal__title">
              <span className="integration-card__icon integration-card__icon--telegram"><Icon name="send" size={20} /></span>
              <div><p className="eyebrow">Службовий канал</p><h2 id="telegram-integration-title">Telegram</h2></div>
            </div>
            <div className="integration-modal__header-actions">
              <span className={telegram?.configured ? 'integration-status integration-status--ready' : 'integration-status'}>
                {telegram?.configured ? 'Підключено' : 'Не налаштовано'}
              </span>
              <button className="icon-button" type="button" onClick={closeModal} aria-label="Закрити"><Icon name="close" size={20} /></button>
            </div>
          </header>

          <form className="integration-form integration-modal__form" onSubmit={submitTelegram}>
            {telegramError && <div className="form-message form-message--error integration-form__wide" role="alert">{telegramError}</div>}
            <label className="field">
              <span>ID чату або @канал</span>
              <input value={chatId} onChange={(event) => setChatId(event.target.value)} autoComplete="off" placeholder="-1001234567890" required autoFocus />
              <small className="integration-field-hint">Не ID бота. Для закритого каналу використовуйте числовий ID у форматі -100…</small>
            </label>
            <label className="field">
              <span>Bot token</span>
              <span className="password-field__control">
                <input type={telegramTokenVisible ? 'text' : 'password'} value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Токен від @BotFather" required />
                <button type="button" onClick={() => setTelegramTokenVisible((value) => !value)} aria-label={telegramTokenVisible ? 'Сховати Telegram bot token' : 'Показати Telegram bot token'}><Icon name={telegramTokenVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <footer className="modal__footer integration-modal__footer integration-form__wide">
              <small>{telegram?.botUsername ? `Підключено @${telegram.botUsername} · ${formatDate(telegram.updatedAt)}` : 'Під час збереження бот і чат будуть перевірені'}</small>
              <button className="button button--secondary" type="button" onClick={closeModal}>Скасувати</button>
              <button className="button button--primary" type="submit" disabled={!chatId.trim() || !telegramToken.trim() || saveTelegram.isPending}>
                <Icon name="save" size={17} />{saveTelegram.isPending ? 'Перевіряємо...' : telegram?.configured ? 'Зберегти' : 'Підключити'}
              </button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}
