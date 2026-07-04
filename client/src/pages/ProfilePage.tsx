import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import { roleLabels } from '../lib/user';
import { useToast } from '../toast/ToastContext';

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [position, setPosition] = useState(user?.position || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);

  if (!user) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const updated = await updateProfile({
        firstName, lastName, email, department, position,
        avatarDataUrl: avatarChanged ? avatarPreview : null,
        currentPassword, newPassword
      });
      setAvatarPreview(updated.avatarUrl);
      setAvatarChanged(false);
      setCurrentPassword('');
      setNewPassword('');
      showToast('Профіль оновлено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити профіль.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <div className="profile-page">
    <header className="page-heading"><p className="eyebrow">Обліковий запис</p><h1>Мій профіль</h1><p>Оновлюйте особисті дані, фото та пароль.</p></header>
    <form className="profile-form" onSubmit={submit}>
      <section className="profile-section">
        <header><div><h2>Основна інформація</h2><p>Ці дані будуть видимі вашим колегам.</p></div><span className="profile-role">{roleLabels[user.role]}</span></header>
        <ProfilePhotoField name={`${firstName} ${lastName}`.trim()} value={avatarPreview} onChange={(value) => { setAvatarPreview(value); setAvatarChanged(true); }} />
        <div className="profile-fields">
          <label className="field"><span>Ім’я</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} minLength={2} maxLength={60} autoComplete="given-name" required /></label>
          <label className="field"><span>Прізвище</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} minLength={2} maxLength={60} autoComplete="family-name" required /></label>
          <label className="field profile-fields__wide"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label className="field"><span>Відділ</span><input value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={120} placeholder="Наприклад, Маркетинг" /></label>
          <label className="field"><span>Посада</span><input value={position} onChange={(event) => setPosition(event.target.value)} maxLength={120} placeholder="Наприклад, Контент-менеджер" /></label>
        </div>
      </section>

      <section className="profile-section">
        <header><div><h2>Зміна пароля</h2><p>Залиште обидва поля порожніми, якщо не плануєте змінювати пароль.</p></div></header>
        <div className="profile-fields">
          <PasswordField label="Поточний пароль" name="currentPassword" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" placeholder="Потрібен лише для зміни пароля" />
          <PasswordField label="Новий пароль" name="newPassword" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={10} placeholder="Щонайменше 10 символів" allowGenerate />
        </div>
      </section>

      <div className="profile-form__actions"><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти зміни'}</button></div>
    </form>
  </div>;
}
