import type { ReactNode } from 'react';
import './PopupToggle.css';

export function PopupToggle({ checked, label, description, role, disabled, onChange }: {
  checked: boolean;
  label: ReactNode;
  description?: ReactNode;
  role?: 'switch';
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="popup-toggle">
    <span className="popup-toggle__copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input className="switch" type="checkbox" role={role} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}
