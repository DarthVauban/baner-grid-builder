import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      await register({
        name: String(form.get('name') || ''),
        email: String(form.get('email') || ''),
        password: String(form.get('password') || '')
      });
      navigate('/login', {
        replace: true,
        state: { notice: 'Реєстрацію завершено. Після схвалення адміністратором ви зможете увійти.' }
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося зареєструватися.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Створити обліковий запис" description="Після реєстрації доступ має підтвердити адміністратор.">
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Ім’я</span>
          <input name="name" type="text" autoComplete="name" minLength={2} maxLength={120} placeholder="Ім’я та прізвище" required autoFocus />
        </label>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" placeholder="name@company.com" required />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} placeholder="Щонайменше 10 символів" required />
        </label>
        <button className="button button--primary button--wide" type="submit" disabled={pending}>
          {pending ? 'Створюємо…' : 'Створити обліковий запис'}
        </button>
      </form>

      <p className="auth-card__switch">Вже маєте обліковий запис? <Link to="/login">Увійти</Link></p>
    </AuthLayout>
  );
}
