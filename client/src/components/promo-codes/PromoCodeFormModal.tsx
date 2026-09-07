import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { StyledSelect } from '../StyledSelect';
import type { PromoCode, PromoCodeInput, PromoCodeType } from '../../types/promo-code';
import '../../styles/promo-codes.css';

function localDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function initialForm(code?: PromoCode | null) {
  return {
    internalName: code?.internalName || '',
    code: code?.code || '',
    type: code?.type || 'percent_coupon' as PromoCodeType,
    discountValue: code ? String(code.discountValue) : '',
    currency: code?.currency || 'UAH',
    startsAt: localDateTime(code?.startsAt),
    endsAt: localDateTime(code?.endsAt),
    usageLimit: code?.usageLimit ? String(code.usageLimit) : '',
    scopeNote: code?.scopeNote || '',
    enabled: code?.enabled ?? true,
    horoshopConfirmed: code?.horoshopConfirmed ?? false
  };
}

export function PromoCodeFormModal({ code, saving, onClose, onSave }: {
  code?: PromoCode | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (input: PromoCodeInput) => Promise<void> | void;
}) {
  const [form, setForm] = useState(() => initialForm(code));
  useEffect(() => setForm(initialForm(code)), [code]);

  const discountValue = Number(form.discountValue);
  const usageLimit = form.usageLimit ? Number(form.usageLimit) : null;
  const invalid = !form.internalName.trim() || !form.code.trim() || !Number.isFinite(discountValue)
    || discountValue <= 0 || (form.type === 'percent_coupon' && discountValue > 100)
    || (form.type === 'amount_certificate' && !form.currency.trim())
    || (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0));

  return <div className="modal-backdrop promo-code-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal modal--structured promo-code-form-modal" role="dialog" aria-modal="true" aria-labelledby="promo-code-form-title">
      <header className="modal__header">
        <div><p className="eyebrow">Бібліотека Хорошоп</p><h2 id="promo-code-form-title">{code ? 'Редагувати промокод' : 'Новий промокод'}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={21} /></button>
      </header>
      <form className="modal__frame" onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        void onSave({
          internalName: form.internalName.trim(),
          code: form.code.trim(),
          type: form.type,
          discountValue,
          currency: form.type === 'amount_certificate' ? form.currency.trim().toUpperCase() : '',
          startsAt: isoDateTime(form.startsAt),
          endsAt: isoDateTime(form.endsAt),
          usageLimit,
          scopeNote: form.scopeNote.trim(),
          enabled: form.enabled,
          horoshopConfirmed: form.horoshopConfirmed
        });
      }}>
        <div className="modal__body promo-code-form">
          <div className="promo-code-form__intro"><Icon name="copy" size={20} /><span><strong>Запис не створює купон у Хорошоп</strong><small>Спочатку створіть та активуйте код у Хорошоп, а тут збережіть його для повторного використання в кампаніях.</small></span></div>
          <div className="promo-code-form__grid">
            <label><span>Внутрішня назва</span><input required maxLength={160} value={form.internalName} onChange={(event) => setForm((current) => ({ ...current, internalName: event.target.value }))} placeholder="Осінній розпродаж" /></label>
            <label><span>Промокод</span><input required maxLength={120} autoCapitalize="characters" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="AUTUMN10" /></label>
            <label><span>Тип</span><StyledSelect value={form.type} options={[{ value: 'percent_coupon', label: 'Відсотковий купон' }, { value: 'amount_certificate', label: 'Сертифікат на суму' }]} onChange={(type) => setForm((current) => ({ ...current, type }))} ariaLabel="Тип промокоду" /></label>
            <label><span>{form.type === 'percent_coupon' ? 'Знижка, %' : 'Сума сертифіката'}</span><input required inputMode="decimal" value={form.discountValue} onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))} placeholder={form.type === 'percent_coupon' ? '10' : '500'} /></label>
            {form.type === 'amount_certificate' && <label><span>Валюта</span><input required maxLength={8} value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} placeholder="UAH" /></label>}
            <label><span>Ліміт використань</span><input inputMode="numeric" value={form.usageLimit} onChange={(event) => setForm((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Без обмеження" /><small>Довідкове поле — фактичний ліміт контролює Хорошоп.</small></label>
            <label><span>Початок дії</span><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
            <label><span>Завершення дії</span><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            <label className="is-full"><span>Бренди, категорії або умови</span><textarea rows={3} maxLength={3000} value={form.scopeNote} onChange={(event) => setForm((current) => ({ ...current, scopeNote: event.target.value }))} placeholder="Наприклад: лише аксесуари Joyroom, крім товарів зі знижкою" /></label>
          </div>
          <div className="promo-code-form__toggles">
            <label><span><strong>Промокод увімкнено</strong><small>Вимкнений запис залишається в бібліотеці, але позначається попередженням.</small></span><input className="switch" type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /></label>
            <label><span><strong>Створено й активовано в Хорошоп</strong><small>Ручне підтвердження того, що цей код існує в адмінці магазину.</small></span><input className="switch" type="checkbox" checked={form.horoshopConfirmed} onChange={(event) => setForm((current) => ({ ...current, horoshopConfirmed: event.target.checked }))} /></label>
          </div>
        </div>
        <footer className="modal__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
          <button className="button button--primary" type="submit" disabled={saving || invalid}><Icon name="save" size={16} /> {saving ? 'Зберігаємо…' : 'Зберегти промокод'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
