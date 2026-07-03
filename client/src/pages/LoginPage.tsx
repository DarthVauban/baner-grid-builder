import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';

interface LocationState {
  from?: string;
  notice?: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      await login({
        email: String(form.get('email') || ''),
        password: String(form.get('password') || '')
      });
      navigate(state.from || '/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося увійти.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Увійти до простору" description="Використовуйте свій корпоративний обліковий запис.">
      {state.notice && <div className="form-message form-message--success" role="status">{state.notice}</div>}
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" placeholder="name@company.com" required autoFocus />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input name="password" type="password" autoComplete="current-password" placeholder="Ваш пароль" required />
        </label>
        <button className="button button--primary button--wide" type="submit" disabled={pending}>
          {pending ? 'Входимо…' : 'Увійти'}
        </button>
      </form>

      <p className="auth-card__switch">Ще немає облікового запису? <Link to="/register">Зареєструватися</Link></p>
    </AuthLayout>
  );
}
