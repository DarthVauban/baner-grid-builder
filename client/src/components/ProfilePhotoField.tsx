import { useId, useState } from 'react';
import { readAvatarFile } from '../lib/avatar';
import { Icon } from './Icon';
import { UserAvatar } from './UserAvatar';

interface ProfilePhotoFieldProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

export function ProfilePhotoField({ name, value, onChange }: ProfilePhotoFieldProps) {
  const inputId = useId();
  const [error, setError] = useState('');

  async function selectFile(file?: File) {
    if (!file) return;
    try {
      setError('');
      onChange(await readAvatarFile(file));
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Не вдалося завантажити фото.');
    }
  }

  return <div className="profile-photo-field">
    <UserAvatar name={name || 'MT'} avatarUrl={value} className="profile-photo-field__preview" />
    <div>
      <strong>Фото профілю <small>необов’язково</small></strong>
      <p>PNG, JPEG або WebP до 1 МБ.</p>
      <span className="profile-photo-field__actions">
        <label className="button button--secondary button--small" htmlFor={inputId}><Icon name="upload" size={16} /> {value ? 'Змінити' : 'Обрати фото'}</label>
        {value && <button className="button button--danger button--small" type="button" onClick={() => onChange('')}>Видалити</button>}
      </span>
      <input id={inputId} name="profile-photo" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectFile(event.target.files?.[0])} />
      {error && <small className="profile-photo-field__error" role="alert">{error}</small>}
    </div>
  </div>;
}
