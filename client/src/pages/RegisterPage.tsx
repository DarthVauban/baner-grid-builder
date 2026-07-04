import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      await register({
        firstName,
        lastName,
        email: String(form.get('email') || ''),
        password,
        avatarDataUrl
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
    <AuthLayout title="Створити обліковий запис" description="Після реєстрації доступ має підтвердити адміністратор." wide>
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      <form className="auth-form auth-form--register" onSubmit={handleSubmit}>
        <label className="field auth-form__wide">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" placeholder="name@company.com" required autoFocus />
        </label>
        <label className="field">
          <span>Ім’я</span>
          <input name="firstName" type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" minLength={2} maxLength={60} placeholder="Ім’я" required />
        </label>
        <label className="field">
          <span>Прізвище</span>
          <input name="lastName" type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" minLength={2} maxLength={60} placeholder="Прізвище" required />
        </label>
        <div className="auth-form__wide"><PasswordField label="Пароль" name="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} placeholder="Щонайменше 10 символів" required allowGenerate /></div>
        <label className="field">
          <span>Відділ <small className="field__soon">Скоро</small></span>
          <input name="department" type="text" placeholder="Буде доступно пізніше" disabled />
        </label>
        <label className="field">
          <span>Посада <small className="field__soon">Скоро</small></span>
          <input name="position" type="text" placeholder="Буде доступно пізніше" disabled />
        </label>
        <div className="auth-form__wide"><ProfilePhotoField name={`${firstName} ${lastName}`.trim()} value={avatarDataUrl} onChange={setAvatarDataUrl} /></div>
        <button className="button button--primary button--wide auth-form__wide" type="submit" disabled={pending}>
          {pending ? 'Створюємо…' : 'Створити обліковий запис'}
        </button>
      </form>

      <p className="auth-card__switch">Вже маєте обліковий запис? <Link to="/login">Увійти</Link></p>
    </AuthLayout>
  );
}
