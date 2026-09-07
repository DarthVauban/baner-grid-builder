import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PromoCodeFormModal } from '../components/promo-codes/PromoCodeFormModal';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { PromoCode, PromoCodeInput, PromoCodeStatus } from '../types/promo-code';
import '../styles/promo-codes.css';

const statusLabels: Record<PromoCodeStatus, string> = {
  active: 'Активний', scheduled: 'Запланований', ended: 'Завершений', disabled: 'Вимкнений'
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' }).format(new Date(value)) : 'без обмеження';
}

function promoValue(item: PromoCode) {
  return item.type === 'percent_coupon'
    ? `${item.discountValue}% знижки`
    : `${item.discountValue.toLocaleString('uk-UA')} ${item.currency}`;
}

function promoInput(item: PromoCode): PromoCodeInput {
  return {
    internalName: item.internalName,
    code: item.code,
    type: item.type,
    discountValue: item.discountValue,
    currency: item.currency,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    usageLimit: item.usageLimit,
    scopeNote: item.scopeNote,
    enabled: item.enabled,
    horoshopConfirmed: item.horoshopConfirmed
  };
}

export function PromoCodesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PromoCodeStatus | ''>('');
  const [editing, setEditing] = useState<PromoCode | null | 'new'>(null);
  const options = useQuery({ queryKey: ['popup-campaign-options'], queryFn: api.popupBanners.options });
  const codes = useQuery({
    queryKey: ['promo-codes', search, status],
    queryFn: ({ signal }) => api.promoCodes.list({ search, status }, signal)
  });
  const createCode = useMutation({ mutationFn: api.promoCodes.create });
  const updateCode = useMutation({ mutationFn: ({ id, input }: { id: string; input: PromoCodeInput }) => api.promoCodes.update(id, input) });
  const removeCode = useMutation({ mutationFn: api.promoCodes.remove });
  const saving = createCode.isPending || updateCode.isPending;

  const overview = useMemo(() => {
    const items = codes.data || [];
    return {
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      scheduled: items.filter((item) => item.status === 'scheduled').length,
      campaigns: new Set(items.flatMap((item) => item.campaigns.map((campaign) => campaign.id))).size
    };
  }, [codes.data]);

  async function save(input: PromoCodeInput) {
    try {
      if (editing === 'new') await createCode.mutateAsync(input);
      else if (editing) await updateCode.mutateAsync({ id: editing.id, input });
      await queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      setEditing(null);
      showToast(editing === 'new' ? 'Промокод додано до бібліотеки.' : 'Промокод оновлено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти промокод.', 'error');
    }
  }

  async function toggle(item: PromoCode) {
    try {
      await updateCode.mutateAsync({ id: item.id, input: { ...promoInput(item), enabled: !item.enabled } });
      await queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      showToast(item.enabled ? 'Промокод вимкнено.' : 'Промокод увімкнено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function remove(item: PromoCode) {
    if (!await confirm({
      title: 'Видалити промокод із бібліотеки?',
      message: item.campaigns.length
        ? 'Цей промокод використовується в кампаніях і не може бути видалений. Його можна вимкнути.'
        : `Запис «${item.internalName}» буде видалено. Сам промокод у Хорошоп це не змінить.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    try {
      await removeCode.mutateAsync(item.id);
      await queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      showToast('Промокод видалено з бібліотеки.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити промокод.', 'error');
    }
  }

  return <div className="promo-codes-page">
    <header className="promo-codes-header">
      <div><p className="eyebrow">Хорошоп · маркетинг</p><h1>Промокоди</h1><p>Локальна бібліотека кодів магазину для повторного використання у кампаніях. Джерелом істини залишається Хорошоп.</p></div>
      <div className="promo-codes-header__actions">
        <Link className="button button--secondary" to="/tools/popup-banners"><Icon name="popup" size={17} /> Кампанії</Link>
        <button className="button button--primary" type="button" onClick={() => setEditing('new')} disabled={!options.data?.integration}><Icon name="add" size={18} /> Новий промокод</button>
      </div>
    </header>

    {!options.isLoading && !options.data?.integration && <div className="popup-connection is-warning"><span className="popup-connection__icon"><Icon name="integrations" size={21} /></span><div><strong>Хорошоп не підключено</strong><small>Підключіть магазин, щоб створити окрему бібліотеку промокодів.</small></div></div>}
    {options.data?.integration && <div className="popup-connection is-connected"><span className="popup-connection__icon"><Icon name="storefront" size={20} /></span><div><strong>{options.data.integration.storeDomain}</strong><small>Усі записи нижче належать лише цьому магазину.</small></div><span className="popup-connection__badge"><i /> Підключено</span></div>}

    <section className="promo-code-overview" aria-label="Огляд бібліотеки">
      <article><span><Icon name="copy" size={20} /></span><div><strong>{overview.total}</strong><small>У бібліотеці</small></div></article>
      <article><span><Icon name="check" size={20} /></span><div><strong>{overview.active}</strong><small>Активні</small></div></article>
      <article><span><Icon name="schedule" size={20} /></span><div><strong>{overview.scheduled}</strong><small>Заплановані</small></div></article>
      <article><span><Icon name="popup" size={20} /></span><div><strong>{overview.campaigns}</strong><small>Кампанії</small></div></article>
    </section>

    <section className="promo-code-library">
      <div className="promo-code-library__toolbar">
        <label className="promo-code-library__search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Знайти за назвою або кодом" aria-label="Пошук промокодів" /></label>
        <StyledSelect value={status} options={[{ value: '', label: 'Усі статуси' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as PromoCodeStatus, label }))]} onChange={setStatus} ariaLabel="Статус промокоду" />
      </div>
      {codes.isLoading && <div className="promo-code-library__state">Завантажуємо промокоди…</div>}
      {codes.isError && <div className="promo-code-library__state"><strong>Не вдалося завантажити бібліотеку</strong><button className="button button--secondary button--small" type="button" onClick={() => void codes.refetch()}>Спробувати ще</button></div>}
      {!codes.isLoading && !codes.data?.length && <div className="promo-code-library__state"><Icon name="copy" size={28} /><strong>Промокодів ще немає</strong><small>Створіть код у Хорошоп, а потім додайте його сюди.</small></div>}
      <div className="promo-code-list">{codes.data?.map((item) => <article key={item.id}>
        <div className="promo-code-list__identity"><strong>{item.internalName}</strong><code>{item.code}</code></div>
        <div className="promo-code-list__value"><strong>{promoValue(item)}</strong><small>{item.horoshopConfirmed ? 'Підтверджено в Хорошоп' : 'Не підтверджено в Хорошоп'}</small></div>
        <span className={`promo-code-status is-${item.status}`}><i />{statusLabels[item.status]}</span>
        <div className="promo-code-list__scope"><strong>{formatDate(item.startsAt)} — {formatDate(item.endsAt)}</strong><small>{item.scopeNote || 'Без примітки про бренди чи категорії'} · {item.usageLimit ? `ліміт ${item.usageLimit}` : 'без ліміту'}</small>{item.campaigns.length > 0 && <small>Кампанії: {item.campaigns.map((campaign) => campaign.name).join(', ')}</small>}</div>
        <div className="promo-code-list__actions">
          <button className="icon-button" type="button" onClick={() => void toggle(item)} aria-label={item.enabled ? 'Вимкнути промокод' : 'Увімкнути промокод'} title={item.enabled ? 'Вимкнути' : 'Увімкнути'}><Icon name={item.enabled ? 'visibilityOff' : 'visibility'} size={17} /></button>
          <button className="icon-button" type="button" onClick={() => setEditing(item)} aria-label="Редагувати промокод"><Icon name="edit" size={17} /></button>
          <button className="icon-button icon-button--danger" type="button" onClick={() => void remove(item)} aria-label="Видалити промокод" disabled={item.campaigns.length > 0}><Icon name="delete" size={17} /></button>
        </div>
      </article>)}</div>
    </section>

    {editing && <PromoCodeFormModal code={editing === 'new' ? null : editing} saving={saving} onClose={() => setEditing(null)} onSave={save} />}
  </div>;
}
