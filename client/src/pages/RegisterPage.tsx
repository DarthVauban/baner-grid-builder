import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import type { RegisterInput, RegistrationStart } from '../types/user';

export function RegisterPage() {
  const { register, verifyRegistration } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [registration, setRegistration] = useState<RegistrationStart | null>(null);
  const [draft, setDraft] = useState<RegisterInput | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (!registration?.resendAvailableAt) {
      setResendSeconds(0);
      return undefined;
    }

    const refresh = () => {
      setResendSeconds(Math.max(0, Math.ceil((new Date(registration.resendAvailableAt).getTime() - Date.now()) / 1000)));
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [registration?.resendAvailableAt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setPending(true);
    const input: RegisterInput = {
      firstName,
      lastName,
      email,
      password,
      avatarDataUrl
    };

    try {
      const started = await register(input);
      setDraft(input);
      setRegistration(started);
      setStep('code');
      setNotice(`Код підтвердження надіслано на ${started.email}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося зареєструватися.');
    } finally {
      setPending(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setPending(true);

    try {
      await verifyRegistration({ email: registration?.email || email, code });
      navigate('/login', {
        replace: true,
        state: { notice: 'Email підтверджено. Увійдіть зі своїм паролем.' }
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося підтвердити код.');
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    if (!draft) return;
    setError('');
    setNotice('');
    setPending(true);

    try {
      const started = await register(draft);
      setRegistration(started);
      setNotice(`Новий код надіслано на ${started.email}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося надіслати код повторно.');
    } finally {
      setPending(false);
    }
  }

  if (step === 'code') {
    return (
      <AuthLayout title="Підтвердити email" description="Введіть 6-значний код із листа, щоб активувати обліковий запис." wide>
        {notice && <div className="form-message form-message--success" role="status">{notice}</div>}
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleVerify}>
          <label className="field">
            <span>Код підтвердження</span>
            <input
              name="code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="\d{6}"
              minLength={6}
              maxLength={6}
              placeholder="000000"
              required
              autoFocus
            />
          </label>
          <button className="button button--primary button--wide" type="submit" disabled={pending || code.length !== 6}>
            {pending ? 'Перевіряємо…' : 'Підтвердити реєстрацію'}
          </button>
          <button className="button button--secondary button--wide" type="button" disabled={pending || resendSeconds > 0} onClick={() => void resendCode()}>
            {resendSeconds > 0 ? `Надіслати повторно через ${resendSeconds} с` : 'Надіслати код повторно'}
          </button>
          <button className="button button--secondary button--wide" type="button" disabled={pending} onClick={() => { setStep('details'); setError(''); setNotice(''); }}>
            Змінити дані
          </button>
        </form>

        <p className="auth-card__switch">Вже маєте підтверджений обліковий запис? <Link to="/login">Увійти</Link></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Створити обліковий запис" description="Після заповнення форми ми надішлемо код підтвердження на email." wide>
      {notice && <div className="form-message form-message--success" role="status">{notice}</div>}
      {error && <div className="form-message form-message--error" role="alert">{error}</div>}

      <form className="auth-form auth-form--register" onSubmit={handleSubmit}>
        <label className="field auth-form__wide">
          <span>Email</span>
          <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" required autoFocus />
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
          {pending ? 'Надсилаємо код…' : 'Надіслати код підтвердження'}
        </button>
      </form>

      <p className="auth-card__switch">Вже маєте обліковий запис? <Link to="/login">Увійти</Link></p>
    </AuthLayout>
  );
}
