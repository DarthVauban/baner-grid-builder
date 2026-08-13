import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../toast/ToastContext';

type ActiveIntegration = 'mailtrap' | 'telegram' | 'horoshop' | null;
const maskedSecretValue = '••••••••••••';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Ще не збережено';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function horoshopStatusLabel(status: string | undefined) {
  if (status === 'connected') return 'Підключено';
  if (status === 'syncing') return 'Синхронізація';
  if (status === 'error') return 'Помилка синхронізації';
  if (status === 'disconnecting') return 'Очищення';
  if (status === 'purge_failed') return 'Очищення не завершено';
  return 'Не налаштовано';
}

export function AdminIntegrationsPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const integrations = useQuery({ queryKey: ['admin-integrations'], queryFn: api.admin.integrations });
  const horoshopIntegration = useQuery({
    queryKey: ['admin-horoshop-integration'],
    queryFn: api.admin.horoshopIntegration,
    refetchInterval: (query) => ['syncing', 'disconnecting'].includes(query.state.data?.status || '') ? 2_000 : false
  });
  const saveMailtrap = useMutation({ mutationFn: api.admin.saveMailtrapIntegration });
  const saveTelegram = useMutation({ mutationFn: api.admin.saveTelegramIntegration });
  const connectHoroshop = useMutation({ mutationFn: api.admin.connectHoroshopIntegration });
  const updateHoroshopSettings = useMutation({ mutationFn: api.admin.updateHoroshopIntegrationSettings });
  const syncHoroshop = useMutation({ mutationFn: api.admin.syncHoroshopCatalog });
  const disconnectHoroshop = useMutation({ mutationFn: api.admin.disconnectHoroshopIntegration });
  const mailtrap = integrations.data?.mailtrap;
  const telegram = integrations.data?.telegram;
  const horoshop = horoshopIntegration.data;

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
  const [storeDomain, setStoreDomain] = useState('');
  const [horoshopLogin, setHoroshopLogin] = useState('');
  const [horoshopPassword, setHoroshopPassword] = useState('');
  const [horoshopPasswordVisible, setHoroshopPasswordVisible] = useState(false);
  const [pollingIntervalMinutes, setPollingIntervalMinutes] = useState(15);
  const [disconnectDomain, setDisconnectDomain] = useState('');
  const [horoshopError, setHoroshopError] = useState('');

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

  function openHoroshop() {
    setStoreDomain(horoshop?.storeDomain || '');
    setHoroshopLogin('');
    setHoroshopPassword('');
    setHoroshopPasswordVisible(false);
    setPollingIntervalMinutes(horoshop?.pollingIntervalMinutes || 15);
    setDisconnectDomain('');
    setHoroshopError('');
    setActiveIntegration('horoshop');
  }

  function closeModal() {
    if (saveMailtrap.isPending || saveTelegram.isPending || connectHoroshop.isPending
      || updateHoroshopSettings.isPending
      || syncHoroshop.isPending || disconnectHoroshop.isPending) return;
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

  async function submitHoroshop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHoroshopError('');
    try {
      await connectHoroshop.mutateAsync({
        storeDomain: storeDomain.trim(),
        login: horoshopLogin.trim(),
        password: horoshopPassword,
        pollingIntervalMinutes
      });
      await queryClient.invalidateQueries({ queryKey: ['admin-horoshop-integration'] });
      showToast('Магазин Хорошоп підключено. Повний імпорт каталогу запущено.');
    } catch (caught) {
      setHoroshopError(caught instanceof Error ? caught.message : 'Не вдалося підключити Хорошоп.');
    }
  }

  async function runHoroshopSync() {
    setHoroshopError('');
    try {
      const result = await syncHoroshop.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ['admin-horoshop-integration'] });
      showToast(result.started ? 'Звірку каталогу запущено.' : 'Синхронізація вже виконується.');
    } catch (caught) {
      setHoroshopError(caught instanceof Error ? caught.message : 'Не вдалося запустити синхронізацію.');
    }
  }

  async function submitHoroshopSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHoroshopError('');
    try {
      await updateHoroshopSettings.mutateAsync({ pollingIntervalMinutes });
      await queryClient.invalidateQueries({ queryKey: ['admin-horoshop-integration'] });
      showToast(`Автоматичну звірку каталогу налаштовано кожні ${pollingIntervalMinutes} хв.`);
    } catch (caught) {
      setHoroshopError(caught instanceof Error ? caught.message : 'Не вдалося зберегти інтервал синхронізації.');
    }
  }

  async function removeHoroshopConnection() {
    setHoroshopError('');
    try {
      const result = await disconnectHoroshop.mutateAsync(disconnectDomain.trim());
      await queryClient.invalidateQueries({ queryKey: ['admin-horoshop-integration'] });
      showToast(`Інтеграцію відключено. Видалено ${result.deleted.products} товарів і ${result.deleted.modifications} модифікацій.`);
      setActiveIntegration(null);
    } catch (caught) {
      setHoroshopError(caught instanceof Error ? caught.message : 'Не вдалося повністю очистити дані Хорошоп.');
    }
  }

  const loadingError = integrations.error instanceof Error
    ? integrations.error.message
    : horoshopIntegration.error instanceof Error ? horoshopIntegration.error.message : '';
  const integrationsLoading = integrations.isLoading || horoshopIntegration.isLoading;

  return (
    <div className="admin-page integrations-page">
      <header className="page-heading admin-page__heading integrations-heading">
        <div>
          <p className="eyebrow">Панель керування</p>
          <h1>Інтеграції</h1>
        </div>
        <p>Підключення зовнішніх сервісів для каталогу товарів, службових повідомлень і резервних копій робочого простору.</p>
      </header>

      {integrationsLoading && <div className="admin-list-state">Завантажуємо інтеграції...</div>}
      {loadingError && <div className="admin-list-state admin-list-state--error">{loadingError}</div>}

      {!integrationsLoading && !loadingError && <div className="integration-grid">
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

        <button
          className="integration-tile"
          type="button"
          onClick={openHoroshop}
          aria-haspopup="dialog"
          aria-label={`Відкрити налаштування Хорошоп. ${horoshopStatusLabel(horoshop?.status)}`}
        >
          <span className="integration-tile__icon integration-tile__icon--horoshop"><Icon name="storefront" size={24} /></span>
          <strong>Хорошоп</strong>
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

          <form className="integration-form integration-modal__form" autoComplete="off" data-form-type="other" onSubmit={submitMailtrap}>
            {mailtrapError && <div className="form-message form-message--error integration-form__wide" role="alert">{mailtrapError}</div>}
            <label className="field">
              <span>Email відправника</span>
              <input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" placeholder="hello@mt-panel.sbs" required autoFocus />
            </label>
            <label className="field">
              <span>Назва відправника</span>
              <input value={senderName} onChange={(event) => setSenderName(event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" maxLength={120} placeholder="MT Panel" required />
            </label>
            <label className="field integration-form__wide">
              <span>Mailtrap API token</span>
              <span className="password-field__control">
                <input
                  type="text"
                  value={!mailtrapTokenVisible && mailtrapToken ? maskedSecretValue : mailtrapToken}
                  onChange={(event) => { setMailtrapTokenVisible(true); setMailtrapToken(event.target.value); }}
                  readOnly={!mailtrapTokenVisible && Boolean(mailtrapToken)}
                  autoComplete="off"
                  autoCapitalize="none"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  spellCheck={false}
                  placeholder="Вставте токен Mailtrap"
                  required
                />
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

          <form className="integration-form integration-modal__form" autoComplete="off" data-form-type="other" onSubmit={submitTelegram}>
            {telegramError && <div className="form-message form-message--error integration-form__wide" role="alert">{telegramError}</div>}
            <label className="field">
              <span>ID чату або @канал</span>
              <input value={chatId} onChange={(event) => setChatId(event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" placeholder="-1001234567890" required autoFocus />
              <small className="integration-field-hint">Не ID бота. Для закритого каналу використовуйте числовий ID у форматі -100…</small>
            </label>
            <label className="field">
              <span>Bot token</span>
              <span className="password-field__control">
                <input
                  type="text"
                  value={!telegramTokenVisible && telegramToken ? maskedSecretValue : telegramToken}
                  onChange={(event) => { setTelegramTokenVisible(true); setTelegramToken(event.target.value); }}
                  readOnly={!telegramTokenVisible && Boolean(telegramToken)}
                  autoComplete="off"
                  autoCapitalize="none"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  spellCheck={false}
                  placeholder="Токен від @BotFather"
                  required
                />
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

      {activeIntegration === 'horoshop' && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
        <section className="modal integration-modal integration-modal--horoshop" role="dialog" aria-modal="true" aria-labelledby="horoshop-integration-title">
          <header className="modal__header integration-modal__header">
            <div className="integration-modal__title">
              <span className="integration-card__icon integration-card__icon--horoshop"><Icon name="storefront" size={20} /></span>
              <div><p className="eyebrow">Каталог товарів</p><h2 id="horoshop-integration-title">Хорошоп</h2></div>
            </div>
            <div className="integration-modal__header-actions">
              <span className={horoshop?.status === 'connected' ? 'integration-status integration-status--ready' : 'integration-status'}>
                {horoshopStatusLabel(horoshop?.status)}
              </span>
              <button className="icon-button" type="button" onClick={closeModal} aria-label="Закрити"><Icon name="close" size={20} /></button>
            </div>
          </header>

          {!horoshop?.configured ? <form className="integration-form integration-modal__form" autoComplete="off" data-form-type="other" onSubmit={submitHoroshop}>
            {horoshopError && <div className="form-message form-message--error integration-form__wide" role="alert">{horoshopError}</div>}
            <div className="integration-note integration-form__wide">
              Використовуйте окремий обліковий запис адміністратора Хорошоп із правами на експорт каталогу. Логін і пароль зберігаються на сервері у зашифрованому вигляді.
            </div>
            <label className="field integration-form__wide">
              <span>Домен магазину</span>
              <input value={storeDomain} onChange={(event) => setStoreDomain(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="shop.example.com" required autoFocus />
              <small className="integration-field-hint">Лише публічний HTTPS-домен без шляху, порту та параметрів.</small>
            </label>
            <label className="field">
              <span>Логін адміністратора</span>
              <input value={horoshopLogin} onChange={(event) => setHoroshopLogin(event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" required />
            </label>
            <label className="field">
              <span>Пароль адміністратора</span>
              <span className="password-field__control">
                <input
                  type={horoshopPasswordVisible ? 'text' : 'password'}
                  value={horoshopPassword}
                  onChange={(event) => setHoroshopPassword(event.target.value)}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  required
                />
                <button type="button" onClick={() => setHoroshopPasswordVisible((value) => !value)} aria-label={horoshopPasswordVisible ? 'Сховати пароль Хорошоп' : 'Показати пароль Хорошоп'}><Icon name={horoshopPasswordVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <label className="field integration-form__wide">
              <span>Інтервал автоматичної синхронізації, хв</span>
              <input type="number" min={1} max={1440} value={pollingIntervalMinutes} onChange={(event) => setPollingIntervalMinutes(Number(event.target.value))} required />
            </label>
            <footer className="modal__footer integration-modal__footer integration-form__wide">
              <small>Після перевірки доступів повний каталог і всі модифікації завантажаться у фоні.</small>
              <button className="button button--secondary" type="button" onClick={closeModal}>Скасувати</button>
              <button className="button button--primary" type="submit" disabled={!storeDomain.trim() || !horoshopLogin.trim() || !horoshopPassword || !Number.isInteger(pollingIntervalMinutes) || connectHoroshop.isPending}>
                <Icon name="integrations" size={17} />{connectHoroshop.isPending ? 'Перевіряємо доступ...' : 'Підключити й імпортувати'}
              </button>
            </footer>
          </form> : <div className="integration-modal__form horoshop-integration-content">
            {horoshopError && <div className="form-message form-message--error" role="alert">{horoshopError}</div>}
            {horoshop.lastError && <div className="form-message form-message--error" role="alert">{horoshop.lastError}</div>}
            <section className="horoshop-integration-summary">
              <div className="horoshop-integration-summary__domain">
                <small>Підключений магазин</small>
                <strong>{horoshop.storeDomain}</strong>
                <span>Синхронізація кожні {horoshop.pollingIntervalMinutes} хв</span>
              </div>
              <div><small>Розділи</small><strong>{horoshop.counts.categories.toLocaleString('uk-UA')}</strong></div>
              <div><small>Товари</small><strong>{horoshop.counts.products.toLocaleString('uk-UA')}</strong></div>
              <div><small>Модифікації</small><strong>{horoshop.counts.modifications.toLocaleString('uk-UA')}</strong></div>
            </section>
            <div className="integration-note">
              {horoshop.status === 'syncing'
                ? `Звірка триває: ${horoshop.latestRun?.productsReceived || 0} товарів, ${horoshop.latestRun?.modificationsReceived || 0} модифікацій, ${horoshop.latestRun?.pagesReceived || 0} пакетів.`
                : `Остання успішна синхронізація: ${formatDate(horoshop.lastSyncAt)}.`}
            </div>
            <form className="horoshop-sync-settings" onSubmit={submitHoroshopSettings}>
              <label className="field">
                <span>Інтервал автоматичної звірки, хв</span>
                <input type="number" min={1} max={1440} value={pollingIntervalMinutes} onChange={(event) => setPollingIntervalMinutes(Number(event.target.value))} required />
                <small className="integration-field-hint">Незмінні товари під час звірки не перезаписуються.</small>
              </label>
              <button className="button button--primary" type="submit" disabled={!Number.isInteger(pollingIntervalMinutes) || pollingIntervalMinutes < 1 || pollingIntervalMinutes > 1440 || pollingIntervalMinutes === horoshop.pollingIntervalMinutes || updateHoroshopSettings.isPending}>
                <Icon name="save" size={17} />{updateHoroshopSettings.isPending ? 'Зберігаємо...' : 'Зберегти інтервал'}
              </button>
            </form>
            <div className="horoshop-integration-actions">
              <button className="button button--secondary" type="button" onClick={() => void runHoroshopSync()} disabled={horoshop.status === 'syncing' || horoshop.status === 'disconnecting' || horoshop.status === 'purge_failed' || syncHoroshop.isPending}>
                <Icon name="refresh" size={17} />{syncHoroshop.isPending ? 'Запускаємо...' : horoshop.status === 'syncing' ? 'Синхронізація триває' : 'Синхронізувати зараз'}
              </button>
            </div>
            <section className="horoshop-disconnect">
              <div>
                <strong>Змінити підключений магазин</strong>
                <p>Відключення безповоротно видалить локальні розділи, товари, модифікації та історію синхронізації. Новий магазин потім імпортується з нуля.</p>
              </div>
              <label className="field">
                <span>Для підтвердження введіть {horoshop.storeDomain}</span>
                <input value={disconnectDomain} onChange={(event) => setDisconnectDomain(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
              </label>
              <button className="button button--danger" type="button" onClick={() => void removeHoroshopConnection()} disabled={disconnectDomain.trim().toLowerCase() !== horoshop.storeDomain.toLowerCase() || disconnectHoroshop.isPending}>
                <Icon name="delete" size={17} />{disconnectHoroshop.isPending ? 'Видаляємо дані...' : horoshop.status === 'purge_failed' ? 'Повторити повне очищення' : 'Відключити й видалити дані'}
              </button>
            </section>
          </div>}
        </section>
      </div>}
    </div>
  );
}
