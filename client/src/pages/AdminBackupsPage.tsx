import { type DragEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
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

const MAX_RESTORE_ARCHIVE_SIZE = 55 * 1024 * 1024;

type ActiveBackupOperation = 'create' | 'restore';

interface BackupOperationProgress {
  kind: ActiveBackupOperation;
  value: number;
}

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

function formatBackupError(message: string) {
  if (message.toLowerCase().includes("bot can't send messages to the bot")) {
    return 'Вказаний Chat ID належить боту. Вкажіть ID свого акаунта, групи або каналу.';
  }
  return message;
}

function progressLabel({ kind, value }: BackupOperationProgress) {
  if (value === 100) return kind === 'create' ? 'Резервну копію створено' : 'Дані успішно відновлено';
  return kind === 'create'
    ? 'Створюємо архів і надсилаємо його в Telegram...'
    : 'Перевіряємо архів і відновлюємо дані...';
}

function OperationProgress({ progress }: { progress: BackupOperationProgress }) {
  const label = progressLabel(progress);
  return <div className="backup-progress" role="status" aria-live="polite">
    <span className={progress.value === 100 ? 'backup-progress__loader backup-progress__loader--done' : 'backup-progress__loader'} aria-hidden="true" />
    <div className="backup-progress__content">
      <span><strong>{label}</strong><small>{progress.value === 100 ? '100%' : `Орієнтовно ${progress.value}%`}</small></span>
      <div
        className="backup-progress__track"
        role="progressbar"
        aria-label={progress.kind === 'create' ? 'Прогрес створення резервної копії' : 'Прогрес відновлення резервної копії'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.value}
      >
        <span style={{ width: `${progress.value}%` }} />
      </div>
    </div>
  </div>;
}

export function AdminBackupsPage() {
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<number | null>(null);
  const progressCleanupTimerRef = useRef<number | null>(null);
  const integrations = useQuery({ queryKey: ['admin-integrations'], queryFn: api.admin.integrations });
  const backups = useQuery({ queryKey: ['admin-backups'], queryFn: api.admin.backups });
  const saveSchedule = useMutation({ mutationFn: api.admin.saveBackupSettings });
  const runBackup = useMutation({ mutationFn: api.admin.runBackup });
  const restoreBackup = useMutation({ mutationFn: api.admin.restoreBackup });
  const telegram = integrations.data?.telegram;
  const backupSettings = backups.data?.settings;

  const [automaticEnabled, setAutomaticEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<BackupScheduleType>('daily');
  const [scheduleTime, setScheduleTime] = useState('03:00');
  const [scheduleWeekday, setScheduleWeekday] = useState(1);
  const [timezone, setTimezone] = useState('Europe/Kyiv');
  const [archive, setArchive] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [operationProgress, setOperationProgress] = useState<BackupOperationProgress | null>(null);
  const [backupError, setBackupError] = useState('');

  useEffect(() => {
    if (!backupSettings) return;
    setAutomaticEnabled(backupSettings.automaticEnabled);
    setScheduleType(backupSettings.scheduleType);
    setScheduleTime(backupSettings.scheduleTime);
    setScheduleWeekday(backupSettings.scheduleWeekday);
    setTimezone(backupSettings.timezone);
  }, [backupSettings]);

  useEffect(() => () => {
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    if (progressCleanupTimerRef.current !== null) window.clearTimeout(progressCleanupTimerRef.current);
  }, []);

  function clearProgressTimers() {
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    if (progressCleanupTimerRef.current !== null) window.clearTimeout(progressCleanupTimerRef.current);
    progressTimerRef.current = null;
    progressCleanupTimerRef.current = null;
  }

  function startProgress(kind: ActiveBackupOperation) {
    clearProgressTimers();
    setOperationProgress({ kind, value: 8 });
    progressTimerRef.current = window.setInterval(() => {
      setOperationProgress((current) => {
        if (!current || current.value >= 94) return current;
        const increment = current.value < 40 ? 6 : current.value < 76 ? 3 : 1;
        return { ...current, value: Math.min(94, current.value + increment) };
      });
    }, 650);
  }

  function finishProgress(clearAfterMs = 650) {
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
    setOperationProgress((current) => current ? { ...current, value: 100 } : current);
    if (clearAfterMs > 0) {
      progressCleanupTimerRef.current = window.setTimeout(() => setOperationProgress(null), clearAfterMs);
    }
  }

  function cancelProgress() {
    clearProgressTimers();
    setOperationProgress(null);
  }

  function selectArchive(file: File | null) {
    setIsDragActive(false);
    if (!file) return;
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.tar.gz') && !fileName.endsWith('.tgz')) {
      setArchive(null);
      setBackupError('Оберіть оригінальний архів резервної копії у форматі .tar.gz або .tgz.');
      return;
    }
    if (file.size > MAX_RESTORE_ARCHIVE_SIZE) {
      setArchive(null);
      setBackupError(`Архів перевищує допустимий розмір ${formatBytes(MAX_RESTORE_ARCHIVE_SIZE)}.`);
      return;
    }
    setBackupError('');
    setArchive(file);
  }

  function openArchivePicker() {
    if (!isBusy) fileInputRef.current?.click();
  }

  function handleArchiveDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (isBusy) return;
    selectArchive(event.dataTransfer.files?.[0] || null);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openArchivePicker();
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
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
    startProgress('create');
    try {
      await runBackup.mutateAsync();
      finishProgress();
      showToast('Резервну копію створено й відправлено в Telegram.');
      void refresh().catch(() => {});
    } catch (caught) {
      cancelProgress();
      setBackupError(caught instanceof Error ? caught.message : 'Не вдалося створити резервну копію.');
      void refresh().catch(() => {});
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
    startProgress('restore');
    try {
      await restoreBackup.mutateAsync(archive);
      finishProgress(0);
      showToast('Резервну копію успішно застосовано. Сторінку буде оновлено.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      cancelProgress();
      setBackupError(caught instanceof Error ? caught.message : 'Не вдалося застосувати резервну копію.');
    }
  }

  const isLoading = integrations.isLoading || backups.isLoading;
  const loadingError = !integrations.data && integrations.error instanceof Error
    ? integrations.error.message
    : !backups.data && backups.error instanceof Error ? backups.error.message : '';
  const isBusy = runBackup.isPending || restoreBackup.isPending;

  return (
    <div className="admin-page backups-page">
      <header className="page-heading admin-page__heading integrations-heading">
        <div>
          <p className="eyebrow">Панель керування</p>
          <h1>Резервні копії</h1>
        </div>
        <p>Автоматичне й ручне копіювання робочого простору, відновлення з архіву та історія операцій.</p>
      </header>

      {isLoading && <div className="admin-list-state">Завантажуємо налаштування резервних копій...</div>}
      {loadingError && <div className="admin-list-state admin-list-state--error">{loadingError}</div>}

      {!isLoading && !loadingError && <div className="backup-page-layout">
        {backupError && <div className="form-message form-message--error backup-page-message" role="alert">{backupError}</div>}

        <section className="admin-section backup-page-card">
          <header className="integration-card__header">
            <span className="integration-card__icon"><Icon name="schedule" size={20} /></span>
            <div>
              <p className="eyebrow">Розклад</p>
              <h2>Автоматичний бекап</h2>
              <p>Регулярне надсилання архіву в підключений Telegram-канал.</p>
            </div>
            <span className={automaticEnabled ? 'integration-status integration-status--ready' : 'integration-status'}>
              {automaticEnabled ? 'Увімкнено' : 'Вимкнено'}
            </span>
          </header>

          <div className={telegram?.configured ? 'backup-destination backup-destination--ready' : 'backup-destination'}>
            <Icon name="send" size={18} />
            <span>
              <strong>{telegram?.configured ? `@${telegram.botUsername || 'Telegram-бот'}` : 'Telegram не підключено'}</strong>
              <small>{telegram?.configured ? `Архіви надсилатимуться в чат ${telegram.chatId}` : 'Підключіть бота, перш ніж вмикати автоматизацію.'}</small>
            </span>
            <Link className="button button--secondary button--compact" to="/admin/integrations">Налаштувати</Link>
          </div>

          <form className="backup-schedule backup-schedule--page" onSubmit={submitSchedule}>
            <label className="backup-toggle backup-schedule__wide">
              <input type="checkbox" checked={automaticEnabled} onChange={(event) => setAutomaticEnabled(event.target.checked)} disabled={!telegram?.configured} />
              <span><strong>Автоматичний бекап</strong><small>Архів створюватиметься й надсилатиметься без участі адміністратора.</small></span>
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
              <button className="button button--primary button--compact" type="submit" disabled={saveSchedule.isPending || (automaticEnabled && !telegram?.configured)}>
                <Icon name="save" size={17} />{saveSchedule.isPending ? 'Зберігаємо...' : 'Зберегти розклад'}
              </button>
            </div>
          </form>
        </section>

        <section className="admin-section backup-page-card backup-operations-card">
          <header className="integration-card__header">
            <span className="integration-card__icon integration-card__icon--backup"><Icon name="backup" size={20} /></span>
            <div>
              <p className="eyebrow">Операції</p>
              <h2>Ручне керування</h2>
              <p>Створення нової копії або повне відновлення робочого простору.</p>
            </div>
          </header>

          <div className="backup-operation-block">
            <div>
              <strong>Створити резервну копію</strong>
              <small>База даних і медіафайли будуть запаковані та надіслані в Telegram.</small>
            </div>
            <button className="button button--primary" type="button" onClick={createManualBackup} disabled={!telegram?.configured || isBusy}>
              <Icon name="send" size={18} />{runBackup.isPending ? 'Створюємо й надсилаємо...' : 'Створити зараз'}
            </button>
            {operationProgress?.kind === 'create' && <OperationProgress progress={operationProgress} />}
          </div>

          <div className="backup-operation-block backup-operation-block--restore">
            <div>
              <strong>Відновити з архіву</strong>
              <small>Виберіть оригінальний файл .tar.gz. Поточні дані буде замінено після підтвердження.</small>
            </div>
            <div className="backup-restore">
              <input
                ref={fileInputRef}
                className="backup-dropzone__input"
                type="file"
                accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
                onChange={(event) => {
                  selectArchive(event.target.files?.[0] || null);
                  event.currentTarget.value = '';
                }}
              />
              <div
                className={isDragActive ? 'backup-dropzone backup-dropzone--active' : archive ? 'backup-dropzone backup-dropzone--selected' : 'backup-dropzone'}
                role="button"
                tabIndex={isBusy ? -1 : 0}
                aria-disabled={isBusy}
                aria-label={archive ? `Вибрано архів ${archive.name}. Натисніть, щоб вибрати інший` : 'Перетягніть архів сюди або натисніть, щоб відкрити провідник'}
                onClick={openArchivePicker}
                onKeyDown={handleDropzoneKeyDown}
                onDragEnter={(event) => { event.preventDefault(); if (!isBusy) setIsDragActive(true); }}
                onDragOver={(event) => { event.preventDefault(); if (!isBusy) setIsDragActive(true); }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragActive(false);
                }}
                onDrop={handleArchiveDrop}
              >
                <span className="backup-dropzone__icon"><Icon name="upload" size={21} /></span>
                <span className="backup-dropzone__copy">
                  <strong>{archive ? archive.name : 'Перетягніть архів сюди'}</strong>
                  <small>{archive ? `${formatBytes(archive.size)} · Натисніть, щоб вибрати інший файл` : 'або натисніть, щоб відкрити провідник · .tar.gz / .tgz'}</small>
                </span>
              </div>
              {archive && !restoreBackup.isPending && <div className="backup-restore__actions">
                <button className="button button--secondary button--compact" type="button" onClick={() => setArchive(null)} disabled={isBusy}>Очистити</button>
                <button className="button button--danger" type="button" onClick={restoreSelectedBackup} disabled={isBusy}>
                  <Icon name="upload" size={18} />Відновити дані
                </button>
              </div>}
              {operationProgress?.kind === 'restore' && <OperationProgress progress={operationProgress} />}
            </div>
          </div>

          <small className="backup-limit-note">Telegram приймає документи до {formatBytes(backups.data?.telegramDocumentLimitBytes || 50 * 1024 * 1024)}.</small>
        </section>

        <section className="admin-section backup-page-card backup-page-card--history">
          <header className="backup-history-header">
            <div>
              <p className="eyebrow">Журнал</p>
              <h2>Останні операції</h2>
            </div>
            <Icon name="history" size={20} />
          </header>

          {!backups.data?.runs.length && <div className="backup-history-empty">Операцій із резервними копіями ще не було.</div>}
          {!!backups.data?.runs.length && <div className="backup-history backup-history--page">
            {backups.data.runs.slice(0, 10).map((run) => <div className="backup-history__row" key={run.id}>
              <span className={run.status === 'success' ? 'backup-run-status backup-run-status--success' : 'backup-run-status backup-run-status--failed'} />
              <span><strong>{triggerLabels[run.trigger]}</strong><small>{run.errorMessage ? formatBackupError(run.errorMessage) : run.fileName || 'Операцію завершено'}</small></span>
              <span><strong>{formatDate(run.completedAt, timezone)}</strong><small>{formatBytes(run.sizeBytes)}</small></span>
            </div>)}
          </div>}
        </section>
      </div>}
    </div>
  );
}
