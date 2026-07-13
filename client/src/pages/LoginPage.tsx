import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import type { TwoFactorLoginChallenge } from '../types/user';

interface LocationState {
  from?: string;
  notice?: string;
}

export function LoginPage() {
  const { login, verifyLoginTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorLoginChallenge | null>(null);

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

  if (challenge) {
    return (
      <AuthLayout title="Підтвердіть 2FA" description={`Введіть 6-значний код із Google Authenticator для ${challenge.email}.`}>
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleTwoFactorSubmit}>
          <label className="field">
            <span>Код 2FA</span>
            <input
              name="twoFactorCode"
              type="text"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/[^0-9a-z-]/gi, '').slice(0, 20).toUpperCase())}
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="000000"
              minLength={6}
              maxLength={20}
              required
              autoFocus
            />
          </label>
          <button className="button button--primary button--wide" type="submit" disabled={pending || twoFactorCode.length < 6}>
            {pending ? 'Перевіряємо…' : 'Підтвердити вхід'}
          </button>
          <button className="button button--secondary button--wide" type="button" disabled={pending} onClick={() => { setChallenge(null); setError(''); }}>
            Повернутися до пароля
          </button>
        </form>
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
