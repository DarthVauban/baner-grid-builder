export function PopupToggle({ checked, label, description, role, onChange }: {
  checked: boolean;
  label: string;
  description?: string;
  role?: 'switch';
  onChange: (checked: boolean) => void;
}) {
  return <label className="popup-toggle">
    <span className="popup-toggle__copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input className="switch" type="checkbox" role={role} checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}
