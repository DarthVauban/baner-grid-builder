import { useEffect, useId, useRef } from 'react';
import './HoroshopProductSearchDialog.css';

interface HoroshopProductSearchDialogProps {
  title: string;
  description: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  countMessage?: string;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function HoroshopProductSearchDialog({ title, description, value, onValueChange, placeholder,
  countMessage, confirmLabel, busy = false, confirmDisabled = false, onConfirm, onClose }: HoroshopProductSearchDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.stopPropagation(); closeRef.current(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return <div className="horoshop-product-search-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}><section className="horoshop-product-search-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)')];
    const first = elements[0]; const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="horoshop-product-search-dialog__head"><div><h2 id={titleId}>{title}</h2><p>{description}</p></div><button className="button horoshop-product-search-dialog__close" type="button" aria-label="Закрити пошук" disabled={busy} onClick={onClose}>×</button></header>
    <label className="horoshop-product-search-dialog__input"><span>Назви або артикули</span><textarea ref={inputRef} rows={8} value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} /></label>
    {countMessage && <p className="horoshop-product-search-dialog__count">{countMessage}</p>}
    <footer className="horoshop-product-search-dialog__actions"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Скасувати</button><button className="button button--primary" type="button" disabled={busy || confirmDisabled} onClick={onConfirm}>{confirmLabel}</button></footer>
  </section></div>;
}
