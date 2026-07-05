import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PasswordField } from '../components/PasswordField';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import { roleLabels } from '../lib/user';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import { Icon } from '../components/Icon';

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
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!user) return null;

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
        <header><div><h2>Пароль і безпека</h2><p>Поточний пароль ніколи не відображається у профілі.</p></div><button className="button button--secondary" type="button" onClick={() => setPasswordModalOpen(true)}><Icon name="password" size={18} /> Змінити пароль</button></header>
      </section>

      <div className="profile-form__actions"><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти зміни'}</button></div>
    </form>
    {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
  </div>;
}
