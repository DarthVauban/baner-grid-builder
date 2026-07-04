import { useId, useState } from 'react';
import { generateStrongPassword } from '../lib/password';
import { Icon } from './Icon';

interface PasswordFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  allowGenerate?: boolean;
}

export function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = false,
  minLength,
  allowGenerate = false
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  function generatePassword() {
    onChange(generateStrongPassword());
    setVisible(true);
  }

  return <div className="field password-field">
    <span className="password-field__label"><label htmlFor={inputId}>{label}</label>{allowGenerate && <button type="button" onClick={generatePassword}><Icon name="password" size={15} /> Згенерувати надійний пароль</button>}</span>
    <span className="password-field__control">
      <input id={inputId} name={name} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} maxLength={128} placeholder={placeholder} required={required} />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Сховати пароль' : 'Показати пароль'} title={visible ? 'Сховати пароль' : 'Показати пароль'}>
        <Icon name={visible ? 'visibilityOff' : 'visibility'} size={19} />
      </button>
    </span>
  </div>;
}
