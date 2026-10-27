import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { locationDistance } from '../lib/store-map-location';
import { useToast } from '../toast/ToastContext';
import type { StoreMapRegistrationRequest, StoreMapRequestStatus } from '../types/store-map';
import { Icon } from './Icon';
import { ModalDialog } from './ModalDialog';
import { StyledSelect } from './StyledSelect';
import { StoreMapLocationFrame } from './StoreMapLocationFrame';

const statusLabels = { NEW: 'Нова', APPROVED: 'Схвалена', REJECTED: 'Відхилена' };
const dateLabel = (value: string) => new Date(value).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short' });

function PermanentRegistrationLink() {
  const { showToast } = useToast();
  const link = `${window.location.origin}/store-map/register`;
  async function copy() {
    try { await navigator.clipboard.writeText(link); showToast('Посилання для продавця скопійовано.'); }
    catch { showToast('Не вдалося скопіювати. Виділіть і скопіюйте посилання з поля.', 'error'); }
  }
  return <section className="store-map-registration-link" aria-label="Постійне посилання для продавців">
    <div><h3>Одне посилання для всіх продавців</h3><p>Постійне багаторазове посилання без строку дії. Продавці заповнюють форму без входу до робочого простору.</p></div>
    <div className="store-map-registration-link-controls">
      <label className="field"><span>Посилання на форму</span><input readOnly value={link} onFocus={(event) => event.target.select()} /></label>
      <button className="button button--primary" type="button" onClick={() => void copy()}><Icon name="copy" size={17} /> Копіювати посилання</button>
      <a className="button button--secondary" href={link} target="_blank" rel="noreferrer"><Icon name="openInNew" size={17} /> Відкрити форму</a>
    </div>
  </section>;
}

function RegistrationReview({ request, onClose, onReviewed, onReload }: {
  request: StoreMapRegistrationRequest; onClose: () => void; onReviewed: () => Promise<void>; onReload: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState({ name: request.name, city: request.city, address: request.address, hoursText: request.hoursText,
    latitude: String(request.latitude), longitude: String(request.longitude), reviewNote: request.reviewNote });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const editable = request.status === 'NEW';
  const coordinatesValid = draft.latitude.trim() !== '' && draft.longitude.trim() !== '' && Number.isFinite(Number(draft.latitude))
    && Math.abs(Number(draft.latitude)) <= 90 && Number.isFinite(Number(draft.longitude)) && Math.abs(Number(draft.longitude)) <= 180;
  const position = coordinatesValid ? { latitude: Number(draft.latitude), longitude: Number(draft.longitude) }
    : { latitude: request.latitude, longitude: request.longitude };
  const adjusted = locationDistance(position, request.measurement) > 0.5;

  async function review(approve: boolean) {
    if (pending || !editable) return;
    if (approve && !coordinatesValid) { setError('Вкажіть коректні координати магазину.'); return; }
    setPending(true);
    setError('');
    try {
      if (approve) await api.storeMap.registration.approve(request.id, { ...draft, ...position, version: request.version });
      else await api.storeMap.registration.reject(request.id, { version: request.version, reviewNote: draft.reviewNote });
      await onReviewed();
      showToast(approve ? 'Заявку схвалено. Магазин додано на публічну мапу.' : 'Заявку відхилено.');
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не вдалося розглянути заявку.'); }
    finally { setPending(false); }
  }
  return <ModalDialog ariaLabelledBy="store-map-review-title" eyebrow="Мапа магазинів · Заявка" title={request.name} onClose={onClose}
    className="store-map-request-modal" closeDisabled={pending} onSubmit={(event) => { event.preventDefault(); void review(true); }}
    footer={<><button className="button button--secondary" type="button" onClick={onClose} disabled={pending}>Закрити</button>{editable && <>
      <button className="button button--danger" type="button" disabled={pending} onClick={() => void review(false)}>Відхилити</button>
      <button className="button button--primary" type="submit" disabled={pending || !coordinatesValid}>{pending ? 'Зберігаємо…' : 'Схвалити й додати магазин'}</button></>}</>}>
    <div className="store-map-registration-stack">
      <div className="store-map-request-meta"><span className={`store-map-request-status store-map-request-status--${request.status.toLowerCase()}`}>{statusLabels[request.status]}</span><span>Подано {dateLabel(request.createdAt)}</span>{request.reviewedAt && <span>Розглянуто {dateLabel(request.reviewedAt)}</span>}</div>
      <div className="store-map-request-layout">
        <div className="store-map-registration-stack">
          <div className="store-map-request-fields">
            <label className="field store-map-field--wide"><span>Назва магазину</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={240} disabled={!editable || pending} /></label>
            <label className="field"><span>Місто</span><input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required maxLength={120} disabled={!editable || pending} /></label>
            <label className="field"><span>Час роботи</span><input value={draft.hoursText} onChange={(event) => setDraft({ ...draft, hoursText: event.target.value })} required maxLength={120} disabled={!editable || pending} placeholder="09:00 - 20:00" /></label>
            <label className="field store-map-field--wide"><span>Адреса</span><input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} required maxLength={500} disabled={!editable || pending} /></label>
            <label className="field"><span>Широта магазину</span><input type="number" step="any" min={-90} max={90} required value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} disabled={!editable || pending} /></label>
            <label className="field"><span>Довгота магазину</span><input type="number" step="any" min={-180} max={180} required value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} disabled={!editable || pending} /></label>
          </div>
          <div className="store-map-request-measurement"><strong>Орієнтовний радіус похибки: {Math.ceil(request.measurement.accuracy)} м</strong>
            <span>Замір {dateLabel(request.measurement.observedAt)} · {request.measurement.sampleCount} вимірювань · {Math.round(request.measurement.durationMs / 1000)} с</span>
            <span>Координати телефону: {request.measurement.latitude.toFixed(7)}, {request.measurement.longitude.toFixed(7)}</span>
            {(!request.measurement.consistent || request.measurement.accuracy > 50) && <p>Позиція потребує особливої перевірки: велика похибка або недостатньо узгоджених замірів.</p>}
            {adjusted && <p>Маркер магазину уточнено вручну. Похибка стосується початкового синього заміру.</p>}
          </div>
        </div>
        <div><StoreMapLocationFrame data={{ position, measurement: request.measurement, editable: editable && !pending }}
          onChange={(next) => setDraft((current) => ({ ...current, latitude: next.latitude.toFixed(7), longitude: next.longitude.toFixed(7) }))} />
          {editable && <button className="button button--secondary button--small" type="button" disabled={pending} onClick={() => setDraft({ ...draft, latitude: String(request.measurement.latitude), longitude: String(request.measurement.longitude) })}>Повернути маркер до заміру</button>}
          <a className="store-map-request-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${position.latitude},${position.longitude}`)}`} target="_blank" rel="noreferrer">Відкрити координати в Google Maps</a>
        </div>
      </div>
      <details className="store-map-submitted-data"><summary>Початкове заповнення продавця</summary><dl>
        <div><dt>Назва</dt><dd>{request.submittedData.name}</dd></div><div><dt>Місто</dt><dd>{request.submittedData.city}</dd></div>
        <div><dt>Адреса</dt><dd>{request.submittedData.address}</dd></div><div><dt>Графік</dt><dd>{request.submittedData.hoursText}</dd></div>
        <div><dt>Маркер продавця</dt><dd>{request.submittedData.latitude.toFixed(7)}, {request.submittedData.longitude.toFixed(7)}</dd></div>
        <div><dt>Коментар</dt><dd>{request.submittedData.comment || 'Не вказано'}</dd></div></dl></details>
      <label className="field"><span>Коментар до рішення (необов’язково)</span><textarea value={draft.reviewNote} onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })} maxLength={2000} rows={2} disabled={!editable || pending} /></label>
      {error && <div className="store-map-state store-map-state--error" role="alert">{error}<button className="button button--secondary button--small" type="button" disabled={pending} onClick={onReload}>Оновити заявку</button></div>}
    </div>
  </ModalDialog>;
}

function RequestDialog({ id, onClose, onReviewed }: { id: string; onClose: () => void; onReviewed: () => Promise<void> }) {
  const details = useQuery({ queryKey: ['store-map-registration', 'detail', id], queryFn: () => api.storeMap.registration.get(id), refetchOnWindowFocus: false });
  if (details.data) return <RegistrationReview key={`${id}-${details.data.version}`} request={details.data} onClose={onClose} onReviewed={onReviewed} onReload={() => { void details.refetch(); }} />;
  return <ModalDialog ariaLabelledBy="store-map-review-loading" eyebrow="Мапа магазинів" title="Заявка" onClose={onClose}>
    <p role="status">{details.isError ? 'Не вдалося завантажити заявку.' : 'Завантажуємо заявку…'}</p>
    {details.isError && <button className="button button--secondary" type="button" onClick={() => { void details.refetch(); }}>Повторити</button>}
  </ModalDialog>;
}

export function StoreMapRequestsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StoreMapRequestStatus | ''>('NEW');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const feed = useQuery({ queryKey: ['store-map-registration', 'requests', search, status, page], queryFn: () => api.storeMap.registration.requests({ search, status, page }), refetchInterval: 30_000 });
  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['store-map-registration'] }), queryClient.invalidateQueries({ queryKey: ['store-map-points'] })]);
  }
  return <section className="store-map-points-card store-map-registration-stack">
    <div className="store-map-section-heading"><div><p className="eyebrow">Реєстрація продавцями</p><h2>Заявки на додавання магазинів</h2><p>Перевірте дані, точність заміру та маркер перед публікацією.</p></div>
    </div>
    <PermanentRegistrationLink />
    <div className="store-map-request-toolbar">
      <label className="store-map-search"><Icon name="search" size={18} /><input value={search} maxLength={240} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Пошук заявок" aria-label="Пошук заявок" /></label>
      <StyledSelect value={status} options={[{ value: '', label: 'Усі заявки' }, { value: 'NEW', label: 'Нові' }, { value: 'APPROVED', label: 'Схвалені' }, { value: 'REJECTED', label: 'Відхилені' }]} onChange={(value) => { setStatus(value as typeof status); setPage(1); }} ariaLabel="Статус заявки" />
      <button className="button button--secondary" type="button" onClick={() => { void refresh(); }}>Оновити</button>
    </div>
    {feed.isLoading && <p role="status">Завантажуємо заявки…</p>}
    {feed.isError && <p className="store-map-state store-map-state--error" role="alert">Не вдалося завантажити заявки. Спробуйте оновити список.</p>}
    {feed.data && !feed.data.items.length && <div className="store-map-state">Заявок за цими фільтрами немає. Надішліть посилання на форму продавцям.</div>}
    <div className="store-map-request-list">{feed.data?.items.map((item) => <button className="store-map-request-card" key={item.id} type="button" onClick={() => setSelected(item.id)}>
      <div><strong>{item.name}</strong><span className={`store-map-request-status store-map-request-status--${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></div>
      <p>{item.city} · {item.address}</p><small>{dateLabel(item.createdAt)} · Радіус похибки: {Math.ceil(item.measurement.accuracy)} м</small>
      <span className="store-map-request-card-action">Переглянути заявку <Icon name="arrow" size={16} /></span>
    </button>)}</div>
    {feed.data && feed.data.total > feed.data.pageSize && <div className="store-map-request-pagination"><button className="button button--secondary button--small" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Попередня</button>
      <span>{page} / {Math.ceil(feed.data.total / feed.data.pageSize)}</span><button className="button button--secondary button--small" type="button" disabled={page * feed.data.pageSize >= feed.data.total} onClick={() => setPage(page + 1)}>Наступна</button></div>}
    {selected && <RequestDialog id={selected} onClose={() => setSelected(null)} onReviewed={refresh} />}
  </section>;
}
