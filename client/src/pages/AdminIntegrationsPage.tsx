import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useToast } from '../toast/ToastContext';
import type { BackupRunTrigger, BackupScheduleType } from '../types/integration';

const weekdays = [
  { value: 1, label: 'Понеділок' },
  { value: 2, label: 'Вівторок' },
  { value: 3, label: 'Середа' },
  { value: 4, label: 'Четвер' },
  { value: 5, label: 'П’ятниця' },
  { value: 6, label: 'Субота' },
  { value: 7, label: 'Неділя' }
];

const timezones = ['Europe/Kyiv', 'Europe/Warsaw', 'Europe/London', 'UTC'];

const triggerLabels: Record<BackupRunTrigger, string> = {
  manual: 'Вручну',
  scheduled: 'За розкладом',
  restore: 'Відновлення'
};

function formatDate(value: string | null | undefined, timezone = 'Europe/Kyiv') {
  if (!value) return 'Ще не виконувалось';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: timezone,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (!value) return '—';
  return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 1 : 2)} МБ`;
}

export function AdminIntegrationsPage() {
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const integrations = useQuery({ queryKey: ['admin-integrations'], queryFn: api.admin.integrations });
  const backups = useQuery({ queryKey: ['admin-backups'], queryFn: api.admin.backups });
  const saveMailtrap = useMutation({ mutationFn: api.admin.saveMailtrapIntegration });
  const saveTelegram = useMutation({ mutationFn: api.admin.saveTelegramIntegration });
  const saveSchedule = useMutation({ mutationFn: api.admin.saveBackupSettings });
  const runBackup = useMutation({ mutationFn: api.admin.runBackup });
  const restoreBackup = useMutation({ mutationFn: api.admin.restoreBackup });
  const mailtrap = integrations.data?.mailtrap;
  const telegram = integrations.data?.telegram;
  const backupSettings = backups.data?.settings;

  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('MT Panel');
  const [mailtrapToken, setMailtrapToken] = useState('');
  const [mailtrapTokenVisible, setMailtrapTokenVisible] = useState(false);
  const [chatId, setChatId] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramTokenVisible, setTelegramTokenVisible] = useState(false);
  const [automaticEnabled, setAutomaticEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<BackupScheduleType>('daily');
  const [scheduleTime, setScheduleTime] = useState('03:00');
  const [scheduleWeekday, setScheduleWeekday] = useState(1);
  const [timezone, setTimezone] = useState('Europe/Kyiv');
  const [archive, setArchive] = useState<File | null>(null);
  const [mailtrapError, setMailtrapError] = useState('');
  const [telegramError, setTelegramError] = useState('');
  const [backupError, setBackupError] = useState('');

  useEffect(() => {
    if (!mailtrap) return;
    setSenderEmail(mailtrap.senderEmail);
    setSenderName(mailtrap.senderName || 'MT Panel');
  }, [mailtrap]);

  useEffect(() => {
    if (!telegram) return;
    setChatId(telegram.chatId);
  }, [telegram]);

  useEffect(() => {
    if (!backupSettings) return;
    setAutomaticEnabled(backupSettings.automaticEnabled);
    setScheduleType(backupSettings.scheduleType);
    setScheduleTime(backupSettings.scheduleTime);
    setScheduleWeekday(backupSettings.scheduleWeekday);
    setTimezone(backupSettings.timezone);
  }, [backupSettings]);

  const loadingError = useMemo(() => {
    const error = integrations.error || backups.error;
    return error instanceof Error ? error.message : '';
  }, [integrations.error, backups.error]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-integrations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
    ]);
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
      setMailtrapToken('');
      showToast('Інтеграцію Mailtrap збережено.');
      await refresh();
    } catch (caught) {
      setMailtrapError(caught instanceof Error ? caught.message : 'Не вдалося зберегти Mailtrap.');
    }
  }

  async function submitTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramError('');
    try {
      await saveTelegram.mutateAsync({ chatId: chatId.trim(), token: telegramToken.trim() });
      setTelegramToken('');
      showToast('Telegram-бота підключено й перевірено.');
      await refresh();
    } catch (caught) {
      setTelegramError(caught instanceof Error ? caught.message : 'Не вдалося підключити Telegram.');
    }
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupError('');
    try {
      await saveSchedule.mutateAsync({ automaticEnabled, scheduleType, scheduleTime, scheduleWeekday, timezone });
      showToast('Розклад резервних копій збережено.');
      await refresh();
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Не вдалося зберегти розклад.');
    }
  }

  async function createManualBackup() {
    setBackupError('');
    try {
      await runBackup.mutateAsync();
      showToast('Резервну копію створено й відправлено в Telegram.');
      await refresh();
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Не вдалося створити резервну копію.');
      await refresh();
    }
  }

  async function restoreSelectedBackup() {
    if (!archive) return;
    const accepted = await confirm({
      title: 'Застосувати резервну копію?',
      message: `Поточні дані та медіафайли будуть замінені вмістом архіву «${archive.name}». Скасувати цю дію після початку неможливо.`,
      confirmLabel: 'Відновити дані',
      tone: 'danger'
    });
    if (!accepted) return;
    setBackupError('');
    try {
      await restoreBackup.mutateAsync(archive);
      showToast('Резервну копію успішно застосовано. Сторінку буде оновлено.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Не вдалося застосувати резервну копію.');
      await refresh();
    }
  }

  const isLoading = integrations.isLoading || backups.isLoading;

  return (
    <div className="admin-page integrations-page">
      <header className="page-heading admin-page__heading integrations-heading">
        <div>
          <p className="eyebrow">Панель керування</p>
          <h1>Інтеграції</h1>
        </div>
        <p>Службові канали, токени й автоматичні резервні копії робочого простору.</p>
      </header>

      {isLoading && <div className="admin-list-state">Завантажуємо інтеграції...</div>}
      {loadingError && <div className="admin-list-state admin-list-state--error">{loadingError}</div>}

      {!isLoading && !loadingError && <div className="integration-grid">
        <section className="admin-section integration-card">
          <header className="integration-card__header">
            <span className="integration-card__icon"><Icon name="integrations" size={20} /></span>
            <div>
              <p className="eyebrow">Email</p>
              <h2>Mailtrap</h2>
              <p>Коди підтвердження та сервісні листи.</p>
            </div>
            <span className={mailtrap?.configured ? 'integration-status integration-status--ready' : 'integration-status'}>
              {mailtrap?.configured ? 'Підключено' : 'Не налаштовано'}
            </span>
          </header>

          <form className="integration-form integration-form--compact" onSubmit={submitMailtrap}>
            {mailtrapError && <div className="form-message form-message--error integration-form__wide" role="alert">{mailtrapError}</div>}
            <label className="field">
              <span>Email відправника</span>
              <input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} autoComplete="off" placeholder="hello@mt-panel.sbs" required />
            </label>
            <label className="field">
              <span>Назва відправника</span>
              <input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} placeholder="MT Panel" required />
            </label>
            <label className="field integration-form__wide">
              <span>{mailtrap?.configured ? 'Новий API token (необов’язково)' : 'Mailtrap API token'}</span>
              <span className="password-field__control">
                <input type={mailtrapTokenVisible ? 'text' : 'password'} value={mailtrapToken} onChange={(event) => setMailtrapToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder={mailtrap?.configured ? 'Залиште порожнім, щоб не змінювати' : 'Вставте токен Mailtrap'} />
                <button type="button" onClick={() => setMailtrapTokenVisible((value) => !value)} aria-label="Показати або сховати токен"><Icon name={mailtrapTokenVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <div className="integration-card__footer integration-form__wide">
              <small>{mailtrap?.updatedAt ? `Оновлено ${formatDate(mailtrap.updatedAt)}` : 'Ще не збережено'}</small>
              <button className="button button--primary button--compact" type="submit" disabled={!senderEmail.trim() || !senderName.trim() || (!mailtrapToken.trim() && !mailtrap?.configured) || saveMailtrap.isPending}>
                <Icon name="save" size={17} />{saveMailtrap.isPending ? 'Зберігаємо...' : 'Зберегти'}
              </button>
            </div>
          </form>
        </section>

        <section className="admin-section integration-card integration-card--telegram">
          <header className="integration-card__header">
            <span className="integration-card__icon integration-card__icon--telegram"><Icon name="send" size={20} /></span>
            <div>
              <p className="eyebrow">Резервні копії</p>
              <h2>Telegram</h2>
              <p>Датовані архіви бази даних і медіафайлів.</p>
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
            </label>
            <label className="field">
              <span>{telegram?.configured ? 'Новий bot token (необов’язково)' : 'Bot token'}</span>
              <span className="password-field__control">
                <input type={telegramTokenVisible ? 'text' : 'password'} value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder={telegram?.configured ? 'Залиште порожнім, щоб не змінювати' : 'Токен від @BotFather'} />
                <button type="button" onClick={() => setTelegramTokenVisible((value) => !value)} aria-label="Показати або сховати токен"><Icon name={telegramTokenVisible ? 'visibilityOff' : 'visibility'} size={18} /></button>
              </span>
            </label>
            <div className="integration-card__footer integration-form__wide">
              <small>{telegram?.botUsername ? `@${telegram.botUsername}` : 'Під час збереження бот і чат будуть перевірені'}</small>
              <button className="button button--primary button--compact" type="submit" disabled={!chatId.trim() || (!telegramToken.trim() && !telegram?.configured) || saveTelegram.isPending}>
                <Icon name="save" size={17} />{saveTelegram.isPending ? 'Перевіряємо...' : 'Підключити'}
              </button>
            </div>
          </form>

          <div className="integration-card__divider" />

          <form className="backup-schedule" onSubmit={submitSchedule}>
            {backupError && <div className="form-message form-message--error backup-schedule__wide" role="alert">{backupError}</div>}
            <label className="backup-toggle backup-schedule__wide">
              <input type="checkbox" checked={automaticEnabled} onChange={(event) => setAutomaticEnabled(event.target.checked)} disabled={!telegram?.configured} />
              <span><strong>Автоматичний бекап</strong><small>Архів надсилатиметься в підключений Telegram-чат.</small></span>
            </label>
            <label className="field">
              <span>Періодичність</span>
              <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as BackupScheduleType)} disabled={!automaticEnabled}>
                <option value="daily">Щодня</option>
                <option value="weekly">Щотижня</option>
              </select>
            </label>
            {scheduleType === 'weekly' && <label className="field">
              <span>День тижня</span>
              <select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))} disabled={!automaticEnabled}>
                {weekdays.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </label>}
            <label className="field">
              <span>Час</span>
              <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} disabled={!automaticEnabled} />
            </label>
            <label className="field">
              <span>Часовий пояс</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!automaticEnabled}>
                {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
            <div className="backup-schedule__meta backup-schedule__wide">
              <span><small>Остання копія</small><strong>{formatDate(backupSettings?.lastRunAt, timezone)}</strong></span>
              <span><small>Наступний запуск</small><strong>{automaticEnabled ? formatDate(backupSettings?.nextRunAt, timezone) : 'Автоматизацію вимкнено'}</strong></span>
              <button className="button button--secondary button--compact" type="submit" disabled={saveSchedule.isPending || (automaticEnabled && !telegram?.configured)}>
                <Icon name="schedule" size={17} />{saveSchedule.isPending ? 'Зберігаємо...' : 'Зберегти розклад'}
              </button>
            </div>
          </form>

          <div className="backup-actions">
            <button className="button button--primary" type="button" onClick={createManualBackup} disabled={!telegram?.configured || runBackup.isPending || restoreBackup.isPending}>
              <Icon name="send" size={18} />{runBackup.isPending ? 'Створюємо й надсилаємо...' : 'Створити бекап зараз'}
            </button>
            <div className="backup-restore">
              <input ref={fileInputRef} type="file" accept=".tar.gz,.tgz,application/gzip" onChange={(event) => setArchive(event.target.files?.[0] || null)} />
              <button className="button button--secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={restoreBackup.isPending}>
                <Icon name="upload" size={18} />{archive ? archive.name : 'Вибрати архів'}
              </button>
              {archive && <button className="button button--danger" type="button" onClick={restoreSelectedBackup} disabled={restoreBackup.isPending}>
                {restoreBackup.isPending ? 'Відновлюємо...' : 'Застосувати'}
              </button>}
            </div>
            <small className="backup-limit-note">Telegram приймає документи до {formatBytes(backups.data?.telegramDocumentLimitBytes || 50 * 1024 * 1024)}.</small>
          </div>

          {!!backups.data?.runs.length && <div className="backup-history">
            <div className="backup-history__title"><Icon name="history" size={17} /><strong>Останні операції</strong></div>
            {backups.data.runs.slice(0, 5).map((run) => <div className="backup-history__row" key={run.id}>
              <span className={run.status === 'success' ? 'backup-run-status backup-run-status--success' : 'backup-run-status backup-run-status--failed'} />
              <span><strong>{triggerLabels[run.trigger]}</strong><small>{run.errorMessage || run.fileName || 'Операцію завершено'}</small></span>
              <span><strong>{formatDate(run.completedAt, timezone)}</strong><small>{formatBytes(run.sizeBytes)}</small></span>
            </div>)}
          </div>}
        </section>
      </div>}
    </div>
  );
}
