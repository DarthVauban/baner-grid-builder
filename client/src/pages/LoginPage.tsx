import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import type { QrLoginConfig, TwoFactorLoginChallenge } from '../types/user';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { QrLoginPanel } from '../components/QrLoginPanel';

interface LocationState {
  from?: string;
  notice?: string;
}

export function LoginPage() {
  const { login, verifyLoginTwoFactor, verifyLoginPasskey, verifyMobileLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorLoginChallenge | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [manualFallback, setManualFallback] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<'pending' | 'denied' | 'expired'>('pending');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [qrConfig, setQrConfig] = useState<QrLoginConfig | null | undefined>(undefined);
  const [loginMethod, setLoginMethod] = useState<'qr' | 'password'>('qr');

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api.auth.qrLoginConfig())
      .then((config) => {
        if (!active) return;
        setQrConfig(config);
        setLoginMethod(config.enabled ? 'qr' : 'password');
      })
      .catch(() => {
        if (!active) return;
        setQrConfig(null);
        setLoginMethod('password');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleQrAuthenticated = useCallback((returnPath: string) => {
    navigate(returnPath || state.from || '/', { replace: true });
  }, [navigate, state.from]);

  const mobileApproval = challenge?.twoFactorMethod === 'mt_workspace'
    ? challenge.mobileApproval
    : undefined;

  useEffect(() => {
    if (!challenge || !mobileApproval || mobileStatus !== 'pending') return undefined;
    let active = true;
    let pollTimer: number | undefined;
    const pollingInterval = Math.min(10_000, Math.max(1_000, mobileApproval.pollingIntervalMs || 2_000));

    const poll = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      try {
        const result = await verifyMobileLogin({
          challengeToken: challenge.challengeToken,
          requestId: mobileApproval.requestId
        });
        if (!active) return;
        if (result.status === 'approved' && result.user) {
          navigate(state.from || '/', { replace: true });
          return;
        }
        if (result.status === 'denied' || result.status === 'expired') {
          setMobileStatus(result.status);
          return;
        }
      } catch (pollError) {
        if (!active) return;
        setError(pollError instanceof Error ? pollError.message : 'Не вдалося перевірити підтвердження входу.');
      }
      if (active) pollTimer = window.setTimeout(() => void poll(), pollingInterval);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !active) return;
      if (pollTimer) window.clearTimeout(pollTimer);
      void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      if (pollTimer) window.clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [challenge, mobileApproval, mobileStatus, navigate, state.from, verifyMobileLogin]);

  useEffect(() => {
    if (!challenge) return undefined;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil(
      (new Date(challenge.expiresAt).getTime() - Date.now()) / 1000
    )));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);

    try {
      const twoFactorChallenge = await login({ email, password });
      if (twoFactorChallenge) {
        setChallenge(twoFactorChallenge);
        setTwoFactorCode('');
        setMobileStatus('pending');
        setManualFallback(twoFactorChallenge.twoFactorMethod === 'mt_workspace'
          && (twoFactorChallenge.mobileApproval?.activeDeviceCount || 0) === 0);
      } else {
        navigate(state.from || '/', { replace: true });
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося увійти.');
    } finally {
      setPending(false);
    }
  }

  async function handleTwoFactorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setError('');
    setPending(true);

    try {
      await verifyLoginTwoFactor({
        challengeToken: challenge.challengeToken,
        code: twoFactorCode
      });
      navigate(state.from || '/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося підтвердити 2FA.');
    } finally {
      setPending(false);
    }
  }

  async function handlePasskeyLogin() {
    if (!challenge) return;
    setError('');
    if (!browserSupportsWebAuthn()) {
      setError('Цей браузер не підтримує Passkeys. Скористайтеся кодом 2FA.');
      return;
    }
    setPasskeyPending(true);
    try {
      const passkeyChallenge = await api.auth.startPasskeyLogin(challenge.challengeToken);
      const response = await startAuthentication({ optionsJSON: passkeyChallenge.options });
      await verifyLoginPasskey(passkeyChallenge.challengeId, response);
      navigate(state.from || '/', { replace: true });
    } catch (passkeyError) {
      setError(passkeyError instanceof Error
        ? passkeyError.message
        : 'Не вдалося підтвердити вхід через телефон.');
    } finally {
      setPasskeyPending(false);
    }
  }

  async function handleBackToPassword() {
    const currentChallenge = challenge;
    setChallenge(null);
    setError('');
    setManualFallback(false);
    setMobileStatus('pending');
    if (currentChallenge?.twoFactorMethod === 'mt_workspace') {
      await api.auth.cancelMobileLogin(currentChallenge.challengeToken).catch(() => {});
    }
  }

  if (challenge) {
    const isMobileApproval = challenge.twoFactorMethod === 'mt_workspace' && Boolean(mobileApproval);
    const mobileStatusMessage = mobileStatus === 'denied'
      ? 'Вхід відхилено у MT Workspace.'
      : mobileStatus === 'expired'
        ? 'Час підтвердження завершився.'
        : mobileApproval?.activeDeviceCount
          ? 'Ми надіслали запит на ваш підключений пристрій.'
          : 'Активних пристроїв немає. Скористайтеся кодом або Passkey.';
    return (
      <AuthLayout
        title="Підтвердіть вхід"
        description={isMobileApproval
          ? `Підтвердьте запит у MT Workspace для ${challenge.email}.`
          : `Введіть код 2FA або скористайтеся Passkey для ${challenge.email}.`}
        wide={challenge.passkeyAvailable || isMobileApproval}
      >
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}

        {isMobileApproval && <section className={`mobile-login-approval mobile-login-approval--${mobileStatus}`} aria-live="polite">
          <span className="mobile-login-approval__visual"><Icon name={mobileStatus === 'pending' ? 'phone' : 'security'} size={34} /></span>
          <div className="mobile-login-approval__copy">
            <strong>{mobileStatus === 'pending' ? 'Очікуємо підтвердження' : mobileStatusMessage}</strong>
            <p>{mobileStatus === 'pending' ? mobileStatusMessage : 'Поверніться до пароля, щоб створити новий запит.'}</p>
            {mobileStatus === 'pending' && <small>
              Запит діє ще {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')}
            </small>}
          </div>
          {mobileStatus === 'pending' && <span className="mobile-login-approval__pulse" aria-hidden="true" />}
        </section>}

        <div className={`login-verification${challenge.passkeyAvailable && (!isMobileApproval || manualFallback) ? ' login-verification--passkey' : ''}`}>
          {(!isMobileApproval || manualFallback) && <form className="auth-form login-verification__code" onSubmit={handleTwoFactorSubmit}>
            <div className="login-verification__title"><span className="login-verification__icon"><Icon name="security" size={20} /></span><div><strong>Код 2FA</strong><small>Google Authenticator</small></div></div>
            <label className="field">
              <span>{isMobileApproval ? '6-значний код або recovery code' : '6-значний код'}</span>
              <input
                name="twoFactorCode"
                type="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(isMobileApproval
                  ? event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 11).toUpperCase()
                  : event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                inputMode={isMobileApproval ? 'text' : 'numeric'}
                placeholder={isMobileApproval ? '000000 або XXXX-XXXXXX' : '000000'}
                minLength={6}
                maxLength={isMobileApproval ? 11 : 6}
                required
                autoFocus
              />
            </label>
            <button className="button button--primary button--wide" type="submit" disabled={pending || passkeyPending || twoFactorCode.length < 6 || (!isMobileApproval && twoFactorCode.length !== 6)}>
              {pending ? 'Перевіряємо…' : 'Підтвердити код'}
            </button>
          </form>}

          {challenge.passkeyAvailable && (!isMobileApproval || manualFallback) && <>
            {(!isMobileApproval || manualFallback) && <div className="login-verification__divider"><span>або</span></div>}
            <section className="passkey-login-card" aria-label="Вхід через телефон">
              <span className="passkey-login-card__visual"><Icon name="qrCode" size={58} /></span>
              <div><strong>Увійти через телефон</strong><p>Відкрийте захищений QR-код і підтвердьте вхід біометрією або PIN.</p></div>
              <button className="button button--secondary button--wide" type="button" disabled={pending || passkeyPending} onClick={() => void handlePasskeyLogin()}>
                <Icon name="phone" size={18} /> {passkeyPending ? 'Очікуємо підтвердження…' : 'Відкрити QR-код'}
              </button>
            </section>
          </>}
        </div>

        {isMobileApproval && mobileStatus === 'pending' && !manualFallback && <div className="mobile-login-alternatives">
          {challenge.passkeyAvailable && <button className="button button--secondary button--wide" type="button" disabled={pending || passkeyPending} onClick={() => void handlePasskeyLogin()}>
            <Icon name="phone" size={18} /> {passkeyPending ? 'Очікуємо Passkey…' : 'Увійти через Passkey'}
          </button>}
          <button className="button button--secondary button--wide" type="button" disabled={pending || passkeyPending} onClick={() => setManualFallback(true)}>
            <Icon name="security" size={18} /> Використати код
          </button>
        </div>}

        <button className="button button--secondary button--wide login-verification__back" type="button" disabled={pending || passkeyPending} onClick={() => void handleBackToPassword()}>
          Повернутися до пароля
        </button>
      </AuthLayout>
    );
  }

  const qrEnabled = Boolean(qrConfig?.enabled);

  return (
    <AuthLayout
      title={loginMethod === 'qr' && qrEnabled ? 'Увійдіть через MT Workspace' : 'Увійти до простору'}
      description={loginMethod === 'qr' && qrEnabled
        ? 'Відскануйте одноразовий QR-код у мобільному застосунку.'
        : 'Використовуйте свій корпоративний обліковий запис.'}
      wide={loginMethod === 'qr' && qrEnabled}
    >
      {state.notice && <div className="form-message form-message--success" role="status">{state.notice}</div>}
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      {qrEnabled && <div className="login-method-tabs" role="tablist" aria-label="Спосіб входу">
        <button
          className={loginMethod === 'qr' ? 'login-method-tabs__tab login-method-tabs__tab--active' : 'login-method-tabs__tab'}
          type="button"
          role="tab"
          aria-selected={loginMethod === 'qr'}
          aria-controls="qr-login-panel"
          onClick={() => setLoginMethod('qr')}
        >
          <Icon name="qrCode" size={17} /> QR-код
        </button>
        <button
          className={loginMethod === 'password' ? 'login-method-tabs__tab login-method-tabs__tab--active' : 'login-method-tabs__tab'}
          type="button"
          role="tab"
          aria-selected={loginMethod === 'password'}
          aria-controls="password-login-panel"
          onClick={() => setLoginMethod('password')}
        >
          <Icon name="password" size={17} /> Логін і пароль
        </button>
      </div>}

      {qrConfig === undefined && <div className="qr-login qr-login__loading" role="status">
        <span className="qr-login__skeleton qr-login__skeleton--code" />
        <span className="sr-only">Перевіряємо доступні способи входу…</span>
      </div>}

      {qrConfig && qrEnabled && loginMethod === 'qr' && <div id="qr-login-panel" role="tabpanel">
        <QrLoginPanel
          config={qrConfig}
          returnPath={state.from || '/'}
          onAuthenticated={handleQrAuthenticated}
          onPasswordRequested={() => setLoginMethod('password')}
        />
      </div>}

      {qrConfig !== undefined && (!qrEnabled || loginMethod === 'password') && <form id="password-login-panel" role={qrEnabled ? 'tabpanel' : undefined} className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" required autoFocus />
        </label>
        <PasswordField label="Пароль" name="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Ваш пароль" required />
        <button className="button button--primary button--wide" type="submit" disabled={pending}>
          {pending ? 'Входимо…' : 'Увійти'}
        </button>
      </form>}

      {qrConfig !== undefined && <p className="auth-card__switch">Ще немає облікового запису? <Link to="/register">Зареєструватися</Link></p>}
    </AuthLayout>
  );
}
