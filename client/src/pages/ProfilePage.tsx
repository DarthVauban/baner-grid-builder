import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import { roleLabels } from '../lib/user';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import { Icon } from '../components/Icon';
import type { TwoFactorSetup, TwoFactorStatus } from '../types/user';

const playMarketUrl = 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2&hl=uk';
const appStoreUrl = 'https://apps.apple.com/ru/app/google-authenticator/id388497605';

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await api.users.changePassword({ currentPassword, newPassword });
      showToast('Пароль змінено.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити пароль.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal password-change-modal" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <header className="modal__header"><div><p className="eyebrow">Безпека</p><h2 id="password-change-title">Зміна пароля</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <form className="password-change-form" onSubmit={submit}>
        <PasswordField label="Поточний пароль" name="currentPassword" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" placeholder="Вкажіть поточний пароль" required />
        <PasswordField label="Новий пароль" name="newPassword" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={10} placeholder="Щонайменше 10 символів" required allowGenerate />
        <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Змінюємо…' : 'Змінити пароль'}</button></footer>
      </form>
    </section>
  </div>;
}

function StoreBadge({ href, icon, kicker, label }: { href: string; icon: 'android' | 'apple'; kicker: string; label: string }) {
  return (
    <a className="store-badge" href={href} target="_blank" rel="noreferrer">
      <Icon name={icon} size={23} />
      <span><small>{kicker}</small><strong>{label}</strong></span>
    </a>
  );
}

function TwoFactorSetupModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => Promise<void> }) {
  const { showToast } = useToast();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setPending(true);
    api.users.startTwoFactorSetup()
      .then((data) => {
        if (active) setSetup(data);
      })
      .catch((setupError) => {
        if (active) setError(setupError instanceof Error ? setupError.message : 'Не вдалося створити QR-код.');
      })
      .finally(() => {
        if (active) setPending(false);
      });

    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  async function copyManualKey() {
    if (!setup?.manualKey) return;
    await navigator.clipboard?.writeText(setup.manualKey.replace(/\s+/g, ''));
    showToast('Ключ скопійовано.');
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await api.users.confirmTwoFactorSetup(code);
      setRecoveryCodes(result.recoveryCodes);
      await onEnabled();
      showToast('2FA увімкнено.');
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Не вдалося підтвердити 2FA.');
    } finally {
      setPending(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal two-factor-modal" role="dialog" aria-modal="true" aria-labelledby="two-factor-title">
      <header className="modal__header">
        <div><p className="eyebrow">Google Authenticator</p><h2 id="two-factor-title">Підключення 2FA</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
      </header>

      {error && <div className="form-message form-message--error" role="alert">{error}</div>}
      {pending && !setup && <div className="admin-list-state">Готуємо QR-код…</div>}

      {setup && !recoveryCodes.length && (
        <div className="two-factor-setup">
          <div className="two-factor-setup__apps">
            <StoreBadge href={playMarketUrl} icon="android" kicker="Завантажити в" label="Google Play" />
            <StoreBadge href={appStoreUrl} icon="apple" kicker="Завантажити в" label="App Store" />
          </div>

          <div className="two-factor-setup__grid">
            <div className="two-factor-qr">
              <img src={setup.qrCodeDataUrl} alt="QR-код для Google Authenticator" />
            </div>
            <div className="two-factor-steps">
              <ol>
                <li>Встановіть Google Authenticator на телефон.</li>
                <li>Натисніть плюс у застосунку та виберіть сканування QR-коду.</li>
                <li>Проскануйте QR-код і введіть нижче 6-значний код.</li>
              </ol>
              <div className="two-factor-manual-key">
                <span>Ручний ключ</span>
                <code>{setup.manualKey}</code>
                <button className="button button--secondary button--small" type="button" onClick={() => void copyManualKey()}><Icon name="copy" size={15} /> Копіювати</button>
              </div>
            </div>
          </div>

          <form className="two-factor-confirm-form" onSubmit={confirm}>
            <label className="field">
              <span>Код із застосунку</span>
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} placeholder="000000" required />
            </label>
            <button className="button button--primary" type="submit" disabled={pending || code.length !== 6}>{pending ? 'Перевіряємо…' : 'Увімкнути 2FA'}</button>
          </form>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="two-factor-recovery">
          <span className="two-factor-recovery__icon"><Icon name="security" size={24} /></span>
          <h3>Резервні коди відновлення</h3>
          <p>Кожен код можна використати один раз, якщо телефон із Google Authenticator буде недоступний.</p>
          <div className="two-factor-recovery__codes">
            {recoveryCodes.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}
          </div>
          <button className="button button--primary" type="button" onClick={onClose}>Готово</button>
        </div>
      )}
    </section>
  </div>;
}

function TwoFactorDisableModal({ onClose, onDisabled }: { onClose: () => void; onDisabled: () => Promise<void> }) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api.users.disableTwoFactor(code);
      await onDisabled();
      showToast('2FA вимкнено.');
      onClose();
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Не вдалося вимкнути 2FA.');
    } finally {
      setPending(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal password-change-modal" role="dialog" aria-modal="true" aria-labelledby="two-factor-disable-title">
      <header className="modal__header"><div><p className="eyebrow">Безпека</p><h2 id="two-factor-disable-title">Вимкнути 2FA</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}
      <form className="password-change-form" onSubmit={submit}>
        <label className="field">
          <span>Код 2FA або резервний код</span>
          <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={20} required />
        </label>
        <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--danger" type="submit" disabled={pending || code.length < 6}>{pending ? 'Вимикаємо…' : 'Вимкнути 2FA'}</button></footer>
      </form>
    </section>
  </div>;
}

export function ProfilePage() {
  const { user, updateProfile, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [position, setPosition] = useState(user?.position || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [twoFactorSetupOpen, setTwoFactorSetupOpen] = useState(false);
  const [twoFactorDisableOpen, setTwoFactorDisableOpen] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api.users.twoFactorStatus()
      .then((status) => {
        if (active) setTwoFactorStatus(status);
      })
      .catch(() => {
        if (active) setTwoFactorStatus(null);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (!user) return null;

  async function refreshSecurity() {
    await refreshUser();
    const status = await api.users.twoFactorStatus();
    setTwoFactorStatus(status);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const updated = await updateProfile({
        firstName, lastName, email, department, position,
        avatarDataUrl: avatarChanged ? avatarPreview : null
      });
      setAvatarPreview(updated.avatarUrl);
      setAvatarChanged(false);
      showToast('Профіль оновлено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити профіль.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <div className="profile-page">
    <header className="page-heading"><p className="eyebrow">Обліковий запис</p><h1>Мій профіль</h1><p>Оновлюйте особисті дані, фото, пароль і параметри безпеки.</p></header>
    <form className="profile-form" onSubmit={submit}>
      <section className="profile-section">
        <header><div><h2>Основна інформація</h2><p>Ці дані будуть видимі вашим колегам.</p></div><span className="profile-role">{roleLabels[user.role]}</span></header>
        <ProfilePhotoField name={`${firstName} ${lastName}`.trim()} value={avatarPreview} onChange={(value) => { setAvatarPreview(value); setAvatarChanged(true); }} />
        <div className="profile-fields">
          <label className="field"><span>Імʼя</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} minLength={2} maxLength={60} autoComplete="given-name" required /></label>
          <label className="field"><span>Прізвище</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} minLength={2} maxLength={60} autoComplete="family-name" required /></label>
          <label className="field profile-fields__wide"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label className="field"><span>Відділ</span><input value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={120} placeholder="Наприклад, Маркетинг" /></label>
          <label className="field"><span>Посада</span><input value={position} onChange={(event) => setPosition(event.target.value)} maxLength={120} placeholder="Наприклад, Контент-менеджер" /></label>
        </div>
      </section>

      <section className="profile-section profile-security-section">
        <header>
          <div><h2>Пароль і безпека</h2><p>Поточний пароль ніколи не відображається у профілі.</p></div>
          <button className="button button--secondary" type="button" onClick={() => setPasswordModalOpen(true)}><Icon name="password" size={18} /> Змінити пароль</button>
        </header>
        <article className={`two-factor-card${twoFactorStatus?.enabled ? ' two-factor-card--enabled' : ''}`}>
          <span className="two-factor-card__icon"><Icon name="security" size={22} /></span>
          <span>
            <strong>Двофакторна автентифікація</strong>
            <small>
              {twoFactorStatus?.enabled
                ? `Увімкнено. Резервних кодів: ${twoFactorStatus.recoveryCodesRemaining}.`
                : 'Додатковий код із Google Authenticator під час входу.'}
            </small>
          </span>
          {twoFactorStatus?.enabled ? (
            <button className="button button--secondary button--small" type="button" onClick={() => setTwoFactorDisableOpen(true)}>Вимкнути</button>
          ) : (
            <button className="button button--primary button--small" type="button" onClick={() => setTwoFactorSetupOpen(true)}><Icon name="qrCode" size={16} /> Увімкнути</button>
          )}
        </article>
      </section>

      <div className="profile-form__actions"><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти зміни'}</button></div>
    </form>
    {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    {twoFactorSetupOpen && <TwoFactorSetupModal onClose={() => setTwoFactorSetupOpen(false)} onEnabled={refreshSecurity} />}
    {twoFactorDisableOpen && <TwoFactorDisableModal onClose={() => setTwoFactorDisableOpen(false)} onDisabled={refreshSecurity} />}
  </div>;
}
