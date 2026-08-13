import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import { ModalDialog } from '../components/ModalDialog';
import { roleLabels } from '../lib/user';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import { Icon } from '../components/Icon';
import type {
  MobileDevice,
  MobilePairing,
  TwoFactorSetup,
  TwoFactorStatus,
  UserPasskey
} from '../types/user';

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

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
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

function formatPairingCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function mobileEnvironmentLabel(environment?: string) {
  return environment === 'production' ? 'Production' : 'DEV';
}

export function MobilePairingModal({ purpose, onClose, onConnected }: {
  purpose: 'enable_2fa' | 'add_device';
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  async function createPairing() {
    setPending(true);
    setError('');
    try {
      const created = await api.users.createMobilePairing(
        purpose,
        purpose === 'add_device' ? verificationCode : null
      );
      setPairing(created);
    } catch (pairingError) {
      setError(pairingError instanceof Error ? pairingError.message : 'Не вдалося створити код підключення.');
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (purpose === 'enable_2fa') void createPairing();
    // Pairing for an additional device starts only after explicit 2FA confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose]);

  useEffect(() => {
    if (!pairing?.qrPayload) {
      setQrCodeDataUrl('');
      return undefined;
    }
    let active = true;
    QRCode.toDataURL(pairing.qrPayload, {
      width: 300,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' }
    }).then((value) => {
      if (active) setQrCodeDataUrl(value);
    }).catch(() => {
      if (active) setError('Не вдалося відобразити QR-код. Використайте ручний код.');
    });
    return () => {
      active = false;
    };
  }, [pairing?.qrPayload]);

  useEffect(() => {
    if (!pairing?.expiresAt || pairing.status !== 'pending') return undefined;
    const update = () => setRemainingSeconds(Math.max(
      0,
      Math.ceil((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)
    ));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairing?.expiresAt, pairing?.status]);

  useEffect(() => {
    if (!pairing?.id || pairing.status !== 'pending') return undefined;
    let active = true;
    let polling = false;
    const poll = async () => {
      if (!active || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const current = await api.users.mobilePairing(pairing.id);
        if (!active) return;
        setPairing((previous) => previous ? { ...previous, ...current } : current);
        if (current.status === 'claimed' && purpose === 'add_device') {
          await onConnectedRef.current();
        }
      } catch (pollError) {
        if (active) setError(pollError instanceof Error ? pollError.message : 'Не вдалося перевірити підключення.');
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    const handleVisibility = () => document.visibilityState === 'visible' && void poll();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pairing?.id, pairing?.status, purpose]);

  async function copyManualCode() {
    if (!pairing?.manualCode) return;
    await navigator.clipboard?.writeText(pairing.manualCode);
    showToast('Код підключення скопійовано.');
  }

  async function cancelPairing() {
    if (!pairing?.id) return onClose();
    if (pairing.status === 'claimed' && pairing.recoveryCodes?.length) {
      setError('Спочатку збережіть резервні коди та підтвердьте це кнопкою нижче.');
      return;
    }
    setPending(true);
    try {
      await api.users.cancelMobilePairing(pairing.id);
      setPairing({ ...pairing, status: 'cancelled' });
      onClose();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Не вдалося скасувати підключення.');
    } finally {
      setPending(false);
    }
  }

  function resetPairing() {
    setPairing(null);
    setQrCodeDataUrl('');
    setError('');
    if (purpose === 'add_device') setVerificationCode('');
    else void createPairing();
  }

  async function acknowledgeRecoveryCodes() {
    if (!pairing?.id) return;
    setPending(true);
    try {
      await api.users.acknowledgeMobilePairing(pairing.id);
      await onConnectedRef.current();
      showToast('MT Workspace підключено.');
      onClose();
    } catch (acknowledgeError) {
      setError(acknowledgeError instanceof Error
        ? acknowledgeError.message
        : 'Не вдалося підтвердити збереження кодів.');
    } finally {
      setPending(false);
    }
  }

  const needsVerification = purpose === 'add_device' && !pairing;
  const title = purpose === 'enable_2fa' ? 'Підключення MT Workspace' : 'Додати мобільний пристрій';

  return <ModalDialog
    ariaLabelledBy="mobile-pairing-title"
    eyebrow="MT Workspace"
    title={title}
    className="two-factor-modal mobile-pairing-modal"
    bodyClassName="mobile-pairing-body"
    onClose={() => void cancelPairing()}
    closeDisabled={pending}
  >
    {error && <div className="form-message form-message--error" role="alert">{error}</div>}

    {needsVerification && <form className="mobile-pairing-verification" onSubmit={(event) => {
      event.preventDefault();
      void createPairing();
    }}>
      <span className="mobile-pairing-hero__icon"><Icon name="security" size={25} /></span>
      <h3>Підтвердьте додавання пристрою</h3>
      <p>Введіть чинний код із MT Workspace або один із резервних кодів.</p>
      <label className="field"><span>Код 2FA або резервний код</span><input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={20} required /></label>
      <div className="mobile-pairing-actions"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending || verificationCode.length < 6}>{pending ? 'Перевіряємо…' : 'Створити код'}</button></div>
    </form>}

    {!pairing && !needsVerification && (pending
      ? <div className="admin-list-state">Готуємо захищений код підключення…</div>
      : <div className="mobile-pairing-result"><span className="mobile-pairing-hero__icon"><Icon name="qrCode" size={25} /></span><h3>Створіть код підключення</h3><p>Код діє 10 хвилин і може бути використаний лише один раз.</p><button className="button button--primary" type="button" onClick={() => void createPairing()}>Створити код</button></div>)}

    {pairing?.status === 'pending' && <div className="mobile-pairing-content">
      {pairing.workspace && <div className="mobile-pairing-environment">
        <span className={`environment-badge environment-badge--${pairing.workspace.environment}`}>
          <span aria-hidden="true" /> {mobileEnvironmentLabel(pairing.workspace.environment)}
        </span>
        <small>{pairing.workspace.displayName} · {pairing.workspace.webOrigin}</small>
      </div>}
      <div className="mobile-pairing-hero">
        <span className="mobile-pairing-hero__icon"><Icon name="phone" size={25} /></span>
        <div><h3>Відскануйте код у застосунку</h3><p>Відкрийте MT Workspace → «Підключити профіль» і відскануйте QR-код.</p></div>
        <strong className="mobile-pairing-countdown">{formatPairingCountdown(remainingSeconds)}</strong>
      </div>
      <div className="mobile-pairing-grid">
        <div className="two-factor-qr mobile-pairing-qr">
          {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt="QR-код для MT Workspace" /> : <span>Створюємо QR…</span>}
        </div>
        <div className="mobile-pairing-instructions">
          <p className="mobile-pairing-account-note">Новий акаунт буде додано до MT Workspace; уже підключені в застосунку акаунти не видаляються.</p>
          <ol><li>Встановіть або відкрийте застосунок MT Workspace.</li><li>Виберіть підключення профілю.</li><li>Відскануйте QR або введіть ручний код.</li></ol>
          <div className="mobile-pairing-manual"><span>Ручний код</span><code>{pairing.manualCode}</code><button className="button button--secondary button--small" type="button" onClick={() => void copyManualCode()}><Icon name="copy" size={15} /> Копіювати</button></div>
        </div>
      </div>
      <div className="mobile-pairing-actions"><button className="button button--secondary" type="button" onClick={() => void cancelPairing()} disabled={pending}>Скасувати</button><button className="button button--secondary" type="button" onClick={resetPairing} disabled={pending}><Icon name="refresh" size={16} /> Створити новий код</button></div>
    </div>}

    {pairing && ['expired', 'cancelled'].includes(pairing.status) && <div className="mobile-pairing-result">
      <span className="mobile-pairing-hero__icon"><Icon name="qrCode" size={25} /></span>
      <h3>{pairing.status === 'expired' ? 'Код протерміновано' : 'Підключення скасовано'}</h3>
      <p>Створіть новий одноразовий код і повторіть підключення.</p>
      <button className="button button--primary" type="button" onClick={resetPairing}>Створити новий код</button>
    </div>}

    {pairing?.status === 'claimed' && pairing.recoveryCodes?.length && <div className="two-factor-recovery">
      <span className="two-factor-recovery__icon"><Icon name="security" size={24} /></span>
      <h3>Збережіть резервні коди</h3>
      <p>Вони показуються востаннє. Кожен код можна використати один раз, якщо телефон недоступний.</p>
      <div className="two-factor-recovery__codes">{pairing.recoveryCodes.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}</div>
      <button className="button button--primary" type="button" onClick={() => void acknowledgeRecoveryCodes()} disabled={pending}>{pending ? 'Зберігаємо…' : 'Я зберіг коди'}</button>
    </div>}

    {pairing?.status === 'claimed' && !pairing.recoveryCodes?.length && <div className="mobile-pairing-result mobile-pairing-result--success">
      <span className="two-factor-recovery__icon"><Icon name="check" size={25} /></span>
      <h3>Пристрій підключено</h3>
      <p>{pairing.device?.name || 'MT Workspace'} готовий підтверджувати входи.</p>
      <button className="button button--primary" type="button" onClick={onClose}>Готово</button>
    </div>}
  </ModalDialog>;
}

function TwoFactorMethodModal({ onClose, onEnabled }: {
  onClose: () => void;
  onEnabled: () => Promise<void>;
}) {
  const [method, setMethod] = useState<'totp' | 'mt_workspace' | null>(null);
  if (method === 'totp') return <TwoFactorSetupModal onClose={onClose} onEnabled={onEnabled} />;
  if (method === 'mt_workspace') {
    return <MobilePairingModal purpose="enable_2fa" onClose={onClose} onConnected={onEnabled} />;
  }

  return <ModalDialog
    ariaLabelledBy="two-factor-method-title"
    eyebrow="Безпека"
    title="Оберіть спосіб 2FA"
    className="two-factor-method-modal"
    bodyClassName="two-factor-method-grid"
    onClose={onClose}
  >
    <button className="two-factor-method-card" type="button" onClick={() => setMethod('mt_workspace')}>
      <span><Icon name="phone" size={25} /></span><strong>MT Workspace</strong><small>Підтверджуйте входи з телефону та отримуйте робочі сповіщення.</small><b>Рекомендовано</b>
    </button>
    <button className="two-factor-method-card" type="button" onClick={() => setMethod('totp')}>
      <span><Icon name="qrCode" size={25} /></span><strong>Google Authenticator</strong><small>Класичні одноразові 6-значні коди без push-підтвердження.</small>
    </button>
  </ModalDialog>;
}

function MobileDeviceRevokeModal({ device, onClose, onRemoved }: {
  device: MobileDevice;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api.users.revokeMobileDevice(device.id, code);
      await onRemoved();
      showToast('Доступ пристрою відкликано.');
      onClose();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Не вдалося відкликати пристрій.');
    } finally {
      setPending(false);
    }
  }

  return <ModalDialog
    ariaLabelledBy="mobile-device-revoke-title"
    eyebrow="MT Workspace"
    title="Відкликати пристрій?"
    className="password-change-modal"
    bodyClassName="passkey-delete-form"
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={pending}
    footer={<><button className="button button--secondary" type="button" onClick={onClose} disabled={pending}>Скасувати</button><button className="button button--danger" type="submit" disabled={pending || code.length < 6}>{pending ? 'Відкликаємо…' : 'Відкликати'}</button></>}
  >
    {error && <div className="form-message form-message--error" role="alert">{error}</div>}
    <p className="passkey-delete-copy">«{device.name}» втратить доступ до мобільного API та push-сповіщень.</p>
    <label className="field"><span>Код 2FA або резервний код</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={20} required /></label>
  </ModalDialog>;
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

function PasskeySetupModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const { showToast } = useToast();
  const [name, setName] = useState('Мій телефон');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!browserSupportsWebAuthn()) {
      setError('Цей браузер не підтримує Passkeys. Спробуйте актуальну версію Chrome, Edge або Safari.');
      return;
    }
    setPending(true);
    try {
      const registration = await api.users.startPasskeyRegistration(code, name);
      const response = await startRegistration({ optionsJSON: registration.options });
      await api.users.finishPasskeyRegistration(registration.challengeId, registration.name, response);
      await onAdded();
      showToast('Passkey успішно підключено.');
      onClose();
    } catch (registrationError) {
      setError(registrationError instanceof Error
        ? registrationError.message
        : 'Не вдалося підключити Passkey.');
    } finally {
      setPending(false);
    }
  }

  return <ModalDialog
    ariaLabelledBy="passkey-setup-title"
    eyebrow="Passkey"
    title="Підключити телефон"
    className="passkey-modal"
    bodyClassName="passkey-setup-form"
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={pending}
    footer={<>
      <button className="button button--secondary" type="button" onClick={onClose} disabled={pending}>Скасувати</button>
      <button className="button button--primary" type="submit" disabled={pending || code.length < 6 || name.trim().length < 2}><Icon name="phone" size={18} /> {pending ? 'Підключаємо…' : 'Показати QR-код'}</button>
    </>}
  >
    {error && <div className="form-message form-message--error" role="alert">{error}</div>}
    <div className="passkey-setup-intro"><span><Icon name="qrCode" size={28} /></span><p>Браузер покаже захищений QR-код. Відскануйте його телефоном і підтвердьте створення Passkey біометрією або PIN.</p></div>
    <label className="field"><span>Назва пристрою</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder="Наприклад, iPhone Дмитра" required /></label>
    <label className="field"><span>Поточний код 2FA</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={20} required /></label>
    <small className="passkey-setup-hint">Якщо ви щойно увійшли, дочекайтеся наступного коду Google Authenticator — використані коди не приймаються повторно.</small>
  </ModalDialog>;
}

function PasskeyDeleteModal({ passkey, onClose, onRemoved }: {
  passkey: UserPasskey;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api.users.removePasskey(passkey.id, code);
      await onRemoved();
      showToast('Passkey видалено.');
      onClose();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Не вдалося видалити Passkey.');
    } finally {
      setPending(false);
    }
  }

  return <ModalDialog
    ariaLabelledBy="passkey-delete-title"
    eyebrow="Безпека"
    title="Видалити Passkey?"
    className="password-change-modal"
    bodyClassName="passkey-delete-form"
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={pending}
    footer={<>
      <button className="button button--secondary" type="button" onClick={onClose} disabled={pending}>Скасувати</button>
      <button className="button button--danger" type="submit" disabled={pending || code.length < 6}>{pending ? 'Видаляємо…' : 'Видалити'}</button>
    </>}
  >
    {error && <div className="form-message form-message--error" role="alert">{error}</div>}
    <p className="passkey-delete-copy">Пристрій «{passkey.name}» більше не можна буде використовувати для входу.</p>
    <label className="field"><span>Код 2FA або резервний код</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())} autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={20} required /></label>
  </ModalDialog>;
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
  const [mobileDevices, setMobileDevices] = useState<MobileDevice[]>([]);
  const [addMobileDeviceOpen, setAddMobileDeviceOpen] = useState(false);
  const [mobileDeviceToRevoke, setMobileDeviceToRevoke] = useState<MobileDevice | null>(null);
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
  const [passkeySetupOpen, setPasskeySetupOpen] = useState(false);
  const [passkeyToDelete, setPasskeyToDelete] = useState<UserPasskey | null>(null);
  const [pending, setPending] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.all([api.users.twoFactorStatus(), api.users.passkeys(), api.users.mobileDevices()])
      .then(([status, items, deviceFeed]) => {
        if (active) {
          setTwoFactorStatus(status);
          setPasskeys(items);
          setMobileDevices(deviceFeed.items);
        }
      })
      .catch(() => {
        if (active) setTwoFactorStatus(null);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!user) return null;

  async function refreshSecurity() {
    await refreshUser();
    const [status, items, deviceFeed] = await Promise.all([
      api.users.twoFactorStatus(),
      api.users.passkeys(),
      api.users.mobileDevices()
    ]);
    setTwoFactorStatus(status);
    setPasskeys(items);
    setMobileDevices(deviceFeed.items);
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
                ? `${twoFactorStatus.method === 'mt_workspace' ? 'MT Workspace' : 'Google Authenticator'} · резервних кодів: ${twoFactorStatus.recoveryCodesRemaining}.`
                : 'Оберіть підтвердження через MT Workspace або Google Authenticator.'}
            </small>
          </span>
          {twoFactorStatus?.enabled ? (
            <button className="button button--secondary button--small" type="button" onClick={() => setTwoFactorDisableOpen(true)}>Вимкнути</button>
          ) : (
            <button className="button button--primary button--small" type="button" onClick={() => setTwoFactorSetupOpen(true)}><Icon name="qrCode" size={16} /> Увімкнути</button>
          )}
        </article>
        {twoFactorStatus?.method === 'mt_workspace' && <article className="mobile-devices-card">
          <header>
            <span className="two-factor-card__icon"><Icon name="phone" size={22} /></span>
            <span><strong>Пристрої MT Workspace</strong><small>Активних пристроїв: {twoFactorStatus.activeMobileDeviceCount}. Нові акаунти додаються без видалення вже підключених.</small></span>
            <button className="button button--primary button--small" type="button" onClick={() => setAddMobileDeviceOpen(true)}><Icon name="add" size={16} /> Додати пристрій</button>
          </header>
          <div className="mobile-device-list">
            {mobileDevices.map((device) => <div className={`mobile-device-list__item${device.revokedAt ? ' mobile-device-list__item--revoked' : ''}`} key={device.id}>
              <span className="passkey-list__device"><Icon name="phone" size={18} /></span>
              <span className="mobile-device-list__copy"><strong>{device.name}</strong><small>{device.platform === 'ios' ? 'iOS' : 'Android'} · додано {new Date(device.pairedAt).toLocaleDateString('uk-UA')}{device.pushConfigured ? ' · push активний' : ''}</small><em className={device.qrLoginSupported ? 'mobile-device-list__capability mobile-device-list__capability--ready' : 'mobile-device-list__capability'}>{device.qrLoginSupported ? 'QR-вхід підтримується' : 'Потрібне оновлення застосунку'}</em></span>
              {device.revokedAt
                ? <span className="mobile-device-list__status">Відкликано</span>
                : <button className="icon-button icon-button--danger" type="button" onClick={() => setMobileDeviceToRevoke(device)} aria-label={`Відкликати пристрій ${device.name}`}><Icon name="delete" size={18} /></button>}
            </div>)}
          </div>
        </article>}
        <article className={`passkey-card${passkeys.length ? ' passkey-card--enabled' : ''}`}>
          <header>
            <span className="two-factor-card__icon"><Icon name="phone" size={22} /></span>
            <span><strong>Вхід через телефон</strong><small>{passkeys.length ? `Підключено пристроїв: ${passkeys.length}.` : 'Підключіть Passkey, щоб входити через захищений QR-код без ручного введення коду.'}</small></span>
            <button className="button button--primary button--small" type="button" disabled={!twoFactorStatus?.enabled} onClick={() => setPasskeySetupOpen(true)}><Icon name="add" size={16} /> Додати Passkey</button>
          </header>
          {!twoFactorStatus?.enabled && <p className="passkey-card__notice">Спочатку увімкніть двофакторну автентифікацію.</p>}
          {passkeys.length > 0 && <div className="passkey-list">
            {passkeys.map((passkey) => <div className="passkey-list__item" key={passkey.id}>
              <span className="passkey-list__device"><Icon name="phone" size={18} /></span>
              <span><strong>{passkey.name}</strong><small>{passkey.deviceType === 'multiDevice' ? 'Синхронізований Passkey' : 'Passkey цього пристрою'} · додано {new Date(passkey.createdAt).toLocaleDateString('uk-UA')}</small></span>
              <button className="icon-button icon-button--danger" type="button" onClick={() => setPasskeyToDelete(passkey)} aria-label={`Видалити Passkey ${passkey.name}`}><Icon name="delete" size={18} /></button>
            </div>)}
          </div>}
        </article>
      </section>

      <div className="profile-form__actions"><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти зміни'}</button></div>
    </form>
    {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    {twoFactorSetupOpen && <TwoFactorMethodModal onClose={() => setTwoFactorSetupOpen(false)} onEnabled={refreshSecurity} />}
    {twoFactorDisableOpen && <TwoFactorDisableModal onClose={() => setTwoFactorDisableOpen(false)} onDisabled={refreshSecurity} />}
    {addMobileDeviceOpen && <MobilePairingModal purpose="add_device" onClose={() => setAddMobileDeviceOpen(false)} onConnected={refreshSecurity} />}
    {mobileDeviceToRevoke && <MobileDeviceRevokeModal device={mobileDeviceToRevoke} onClose={() => setMobileDeviceToRevoke(null)} onRemoved={refreshSecurity} />}
    {passkeySetupOpen && <PasskeySetupModal onClose={() => setPasskeySetupOpen(false)} onAdded={refreshSecurity} />}
    {passkeyToDelete && <PasskeyDeleteModal passkey={passkeyToDelete} onClose={() => setPasskeyToDelete(null)} onRemoved={refreshSecurity} />}
  </div>;
}
