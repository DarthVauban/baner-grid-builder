import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../toast/ToastContext';
import type { PromoCode, PromoCodeStatus } from '../../types/promo-code';
import { Icon } from '../Icon';
import { StyledSelect } from '../StyledSelect';
import { PromoCodeFormModal } from './PromoCodeFormModal';

const statusLabels: Record<PromoCodeStatus, string> = {
  active: 'Активний', scheduled: 'Запланований', ended: 'Завершений', disabled: 'Вимкнений'
};

function promoValue(item: PromoCode) {
  return item.type === 'percent_coupon'
    ? `${item.discountValue}%`
    : `${item.discountValue.toLocaleString('uk-UA')} ${item.currency}`;
}

export function PromoCodePickerModal({ selectedId, onClose, onSelect }: {
  selectedId: string | null;
  onClose: () => void;
  onSelect: (code: PromoCode) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PromoCodeStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const codes = useQuery({
    queryKey: ['promo-codes', search, status],
    queryFn: ({ signal }) => api.promoCodes.list({ search, status }, signal)
  });
  const createCode = useMutation({ mutationFn: api.promoCodes.create });

  return <>
    <div className="modal-backdrop promo-code-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal modal--structured promo-code-picker-modal" role="dialog" aria-modal="true" aria-labelledby="promo-code-picker-title">
        <header className="modal__header">
          <div><p className="eyebrow">Бібліотека магазину</p><h2 id="promo-code-picker-title">Обрати промокод</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={21} /></button>
        </header>
        <div className="modal__frame">
          <div className="modal__body promo-code-picker">
            <div className="promo-code-picker__tools">
              <label><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Назва або код" aria-label="Пошук промокодів" /></label>
              <StyledSelect value={status} options={[{ value: '', label: 'Усі статуси' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as PromoCodeStatus, label }))]} onChange={setStatus} ariaLabel="Статус промокоду" />
              <button className="button button--secondary button--small" type="button" onClick={() => setCreating(true)}><Icon name="add" size={16} /> Створити</button>
            </div>
            {codes.isLoading && <div className="promo-code-picker__state">Завантажуємо бібліотеку…</div>}
            {codes.isError && <div className="promo-code-picker__state is-error">Не вдалося завантажити промокоди.</div>}
            {!codes.isLoading && !codes.data?.length && <div className="promo-code-picker__state"><Icon name="copy" size={26} /><strong>Промокодів не знайдено</strong><small>Створіть перший запис або змініть фільтр.</small></div>}
            <div className="promo-code-picker__list">{codes.data?.map((item) => {
              const warning = !item.horoshopConfirmed || item.status === 'ended' || item.status === 'disabled';
              return <button type="button" className={item.id === selectedId ? 'is-selected' : ''} onClick={() => onSelect(item)} key={item.id}>
                <span className={`promo-code-status is-${item.status}`}><i />{statusLabels[item.status]}</span>
                <span className="promo-code-picker__identity"><strong>{item.internalName}</strong><code>{item.code}</code></span>
                <b>{promoValue(item)}</b>
                {warning && <small><Icon name="deadline" size={13} />{!item.horoshopConfirmed ? 'Не підтверджено в Хорошоп' : item.status === 'ended' ? 'Термін дії завершився' : 'Запис вимкнено'}</small>}
                <span className="promo-code-picker__check"><Icon name="check" size={15} /></span>
              </button>;
            })}</div>
          </div>
          <footer className="modal__footer"><small>Вибір зберігається в чернетці. Під час публікації створюється незмінний snapshot.</small><button className="button button--secondary" type="button" onClick={onClose}>Закрити</button></footer>
        </div>
      </section>
    </div>
    {creating && <PromoCodeFormModal saving={createCode.isPending} onClose={() => setCreating(false)} onSave={async (input) => {
      try {
        const created = await createCode.mutateAsync(input);
        await queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
        setCreating(false);
        onSelect(created);
        showToast('Промокод створено та вибрано.', 'success');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Не вдалося створити промокод.', 'error');
      }
    }} />}
  </>;
}
