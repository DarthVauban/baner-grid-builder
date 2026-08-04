import { useState } from 'react';
import type { FormEvent } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import type { TwoFactorLoginChallenge } from '../types/user';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';

interface LocationState {
  from?: string;
  notice?: string;
}

export function LoginPage() {
  const { login, verifyLoginTwoFactor, verifyLoginPasskey } = useAuth();
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);

    try {
      const twoFactorChallenge = await login({ email, password });
      if (twoFactorChallenge) {
        setChallenge(twoFactorChallenge);
        setTwoFactorCode('');
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

  if (challenge) {
    return (
      <AuthLayout
        title="Підтвердіть вхід"
        description={`Введіть код 2FA або скористайтеся Passkey для ${challenge.email}.`}
        wide={challenge.passkeyAvailable}
      >
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}

        <div className={`login-verification${challenge.passkeyAvailable ? ' login-verification--passkey' : ''}`}>
          <form className="auth-form login-verification__code" onSubmit={handleTwoFactorSubmit}>
            <div className="login-verification__title"><span className="login-verification__icon"><Icon name="security" size={20} /></span><div><strong>Код 2FA</strong><small>Google Authenticator</small></div></div>
            <label className="field">
              <span>6-значний код</span>
              <input
                name="twoFactorCode"
                type="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                minLength={6}
                maxLength={6}
                required
                autoFocus
              />
            </label>
            <button className="button button--primary button--wide" type="submit" disabled={pending || passkeyPending || twoFactorCode.length !== 6}>
              {pending ? 'Перевіряємо…' : 'Підтвердити код'}
            </button>
          </form>

          {challenge.passkeyAvailable && <>
            <div className="login-verification__divider"><span>або</span></div>
            <section className="passkey-login-card" aria-label="Вхід через телефон">
              <span className="passkey-login-card__visual"><Icon name="qrCode" size={58} /></span>
              <div><strong>Увійти через телефон</strong><p>Відкрийте захищений QR-код і підтвердьте вхід біометрією або PIN.</p></div>
              <button className="button button--secondary button--wide" type="button" disabled={pending || passkeyPending} onClick={() => void handlePasskeyLogin()}>
                <Icon name="phone" size={18} /> {passkeyPending ? 'Очікуємо підтвердження…' : 'Відкрити QR-код'}
              </button>
            </section>
          </>}
        </div>

        <button className="button button--secondary button--wide login-verification__back" type="button" disabled={pending || passkeyPending} onClick={() => { setChallenge(null); setError(''); }}>
          Повернутися до пароля
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Увійти до простору" description="Використовуйте свій корпоративний обліковий запис.">
      {state.notice && <div className="form-message form-message--success" role="status">{state.notice}</div>}
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" required autoFocus />
        </label>
        <PasswordField label="Пароль" name="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Ваш пароль" required />
        <button className="button button--primary button--wide" type="submit" disabled={pending}>
          {pending ? 'Входимо…' : 'Увійти'}
        </button>
      </form>

      <p className="auth-card__switch">Ще немає облікового запису? <Link to="/register">Зареєструватися</Link></p>
    </AuthLayout>
  );
}
