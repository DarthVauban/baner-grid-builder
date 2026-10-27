import { useEffect, useState, type FormEvent } from 'react';
import { StoreMapCoordinatePicker } from '../components/StoreMapCoordinatePicker';
import type { StoreMapLocationFrameData } from '../components/StoreMapLocationFrame';
import { publicRegistrationState, submitPublicRegistration } from '../lib/api-store-map-registration';
import { locationDistance, useStoreMapLocation } from '../lib/store-map-location';
import type { StoreMapPosition } from '../types/store-map';

export function StoreMapRegistrationApp() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [state, setState] = useState<'LOADING' | 'OPEN' | 'SUBMITTED' | 'ERROR'>('LOADING');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState({ name: '', city: '', address: '', hoursText: '09:00 - 20:00', comment: '' });
  const [position, setPosition] = useState<StoreMapPosition | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const location = useStoreMapLocation();

  useEffect(() => {
    const controller = new AbortController();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setState('ERROR');
      setError('Посилання неповне або недійсне. Відкрийте повне посилання, отримане від відповідального.');
      return;
    }
    publicRegistrationState(token, controller.signal).then((result) => setState(result.status)).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Не вдалося перевірити посилання.');
      setState('ERROR');
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!location.measurement) setPosition(null);
    else {
      const measured = { latitude: location.measurement.latitude, longitude: location.measurement.longitude };
      setPosition((current) => location.running || !current ? measured : current);
    }
    setConfirmed(false);
  }, [location.measurement, location.running]);

  function changePosition(next: StoreMapPosition) {
    setPosition(next);
    setConfirmed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!location.measurement || !position || !confirmed || location.running || pending) return;
    setPending(true);
    setError('');
    try {
      await submitPublicRegistration(token, { ...fields, ...position, measurement: location.measurement, confirmed: true });
      setState('SUBMITTED');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не вдалося надіслати заявку. Спробуйте ще раз.');
    } finally { setPending(false); }
  }

  const measurement = location.measurement;
  const adjusted = measurement && position && locationDistance(measurement, position) > 0.5;
  return <main className="store-registration-page">
    <header className="store-registration-heading"><span className="store-registration-brand">MT / МАПА МАГАЗИНІВ</span>
      <h1>{state === 'SUBMITTED' ? 'Заявку отримано' : 'Додайте свій магазин'}</h1>
      <p>{state === 'SUBMITTED' ? 'Відповідальний перевірить дані та розташування. Після схвалення магазин з’явиться на мапі.'
        : 'Заповніть дані, перебуваючи біля магазину. Місцезнаходження визначимо за допомогою вашого телефону.'}</p>
    </header>
    {state === 'LOADING' && <div className="store-registration-card" role="status">Перевіряємо посилання…</div>}
    {state === 'ERROR' && <div className="store-registration-card store-registration-alert" role="alert">{error}</div>}
    {state === 'SUBMITTED' && <section className="store-registration-card store-registration-success"><span aria-hidden="true">✓</span><h2>Дякуємо за допомогу!</h2><p>Це посилання вже використано. Повторно надсилати заявку не потрібно.</p></section>}
    {state === 'OPEN' && <form onSubmit={(event) => void submit(event)}>
      <section className="store-registration-card"><div className="store-registration-section-title"><span>01</span><div><h2>Дані магазину</h2><p>Так магазин буде представлений покупцям.</p></div></div>
        <div className="store-registration-fields">
          <label className="store-registration-wide">Назва магазину<input value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} maxLength={240} required autoComplete="organization" placeholder="Наприклад, Mobile Trend — Центр" /></label>
          <label>Місто<input value={fields.city} onChange={(event) => setFields({ ...fields, city: event.target.value })} maxLength={120} required autoComplete="address-level2" /></label>
          <label>Час роботи щодня<input value={fields.hoursText} onChange={(event) => setFields({ ...fields, hoursText: event.target.value })} maxLength={120} required placeholder="09:00 - 20:00" /></label>
          <label className="store-registration-wide">Адреса<input value={fields.address} onChange={(event) => setFields({ ...fields, address: event.target.value })} maxLength={500} required autoComplete="street-address" placeholder="Вулиця, будинок, назва ТРЦ" /></label>
          <label className="store-registration-wide">Коментар (необов’язково)<textarea value={fields.comment} onChange={(event) => setFields({ ...fields, comment: event.target.value })} maxLength={2000} rows={2} placeholder="Поверх, орієнтир або як знайти вхід" /></label>
        </div>
      </section>
      <section className="store-registration-card"><div className="store-registration-section-title"><span>02</span><div><h2>Точне розташування</h2><p>Станьте біля входу до магазину й залишайтеся на місці під час заміру.</p></div></div>
        <p className="store-registration-location-tip">Увімкніть Wi-Fi та точне місцезнаходження в налаштуваннях телефону. Дозвольте геолокацію браузеру. Телефон сам обере доступні джерела позиції.</p>
        <div className="store-registration-actions">
          <button className="store-registration-button" type="button" disabled={location.running || pending} onClick={location.start}>{measurement ? 'Повторити замір' : 'Визначити місцезнаходження'}</button>
          {location.running && <button className="store-registration-button store-registration-button--secondary" type="button" disabled={location.elapsed < 15 || !measurement} onClick={location.finish}>Завершити замір</button>}
        </div>
        {location.running && <div className="store-registration-progress" role="status"><progress max={60} value={location.elapsed} /><p>Уточнюємо позицію… {60 - location.elapsed} с. Можна продовжувати заповнювати форму.</p></div>}
        {location.error && <p className="store-registration-alert" role="alert">{location.error}</p>}
        {measurement && <div className={`store-registration-accuracy${measurement.accuracy > 50 || !measurement.consistent ? ' store-registration-accuracy--warning' : ''}`} role="status">
          <strong>Орієнтовний радіус похибки: {Math.ceil(measurement.accuracy)} м</strong>
          <span>Свіжих вимірювань: {measurement.sampleCount}. Це оцінка телефону, а не гарантована точність.</span>
          {!location.running && measurement.accuracy > 50 && <p>Похибка завелика для точного входу. Спробуйте повторити замір біля входу або уточніть маркер на карті.</p>}
          {!location.running && !measurement.consistent && <p>Немає кількох узгоджених вимірювань. Перевірте розташування на карті або повторіть замір.</p>}
        </div>}
        {measurement && position && <>
          <StoreMapCoordinatePicker position={position} measurement={measurement} editable={!location.running && !pending} onChange={changePosition} />
          <p className="store-registration-coordinates">Маркер: {position.latitude.toFixed(7)}, {position.longitude.toFixed(7)}{adjusted ? ' · уточнено вручну' : ''}</p>
          <details className="store-registration-manual"><summary>Уточнити координати числами</summary><div className="store-registration-fields">
            <label>Широта<input aria-label="Широта магазину" type="number" step="any" min={-90} max={90} value={position.latitude} disabled={location.running || pending} onChange={(event) => { if (event.target.value && Number.isFinite(event.target.valueAsNumber) && Math.abs(event.target.valueAsNumber) <= 90) changePosition({ ...position, latitude: event.target.valueAsNumber }); }} /></label>
            <label>Довгота<input aria-label="Довгота магазину" type="number" step="any" min={-180} max={180} value={position.longitude} disabled={location.running || pending} onChange={(event) => { if (event.target.value && Number.isFinite(event.target.valueAsNumber) && Math.abs(event.target.valueAsNumber) <= 180) changePosition({ ...position, longitude: event.target.valueAsNumber }); }} /></label>
          </div></details>
          {!location.running && <button className="store-registration-text-button" type="button" disabled={pending} onClick={() => changePosition({ latitude: measurement.latitude, longitude: measurement.longitude })}>Повернути маркер до заміру телефону</button>}
          {adjusted && <p className="store-registration-location-tip">Похибка стосується синього заміру телефону. Фіолетовий маркер уточнено вручну; обидві позиції побачить відповідальний.</p>}
        </>}
      </section>
      <section className="store-registration-card store-registration-submit">
        <label className="store-registration-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!measurement || location.running || pending} required /><span>Я перевірив дані та положення маркера магазину на карті.</span></label>
        <p>Під час надсилання передамо координати й оцінку їх точності відповідальному за мапу. Автоматичного додавання магазину немає.</p>
        {error && <p className="store-registration-alert" role="alert">{error}</p>}
        <button className="store-registration-button" type="submit" disabled={!measurement || !position || location.running || !confirmed || pending}>{pending ? 'Надсилаємо…' : 'Надіслати заявку'}</button>
      </section>
    </form>}
    <footer className="store-registration-footer">Мапа магазинів · MT Workspace</footer>
  </main>;
}

export function StoreMapLocationPreviewApp() {
  const [data, setData] = useState<StoreMapLocationFrameData | null>(null);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'mt-store-map:location-data') return;
      const next = event.data.data as StoreMapLocationFrameData | undefined;
      if (!next || !Number.isFinite(next.position?.latitude) || Math.abs(next.position.latitude) > 90
        || !Number.isFinite(next.position.longitude) || Math.abs(next.position.longitude) > 180
        || !Number.isFinite(next.measurement?.latitude) || Math.abs(next.measurement.latitude) > 90
        || !Number.isFinite(next.measurement.longitude) || Math.abs(next.measurement.longitude) > 180
        || !Number.isFinite(next.measurement.accuracy) || next.measurement.accuracy <= 0 || next.measurement.accuracy > 1_000_000) return;
      setData({ ...next, editable: next.editable === true });
    };
    window.addEventListener('message', message);
    window.parent.postMessage({ type: 'mt-store-map:location-ready' }, window.location.origin);
    return () => window.removeEventListener('message', message);
  }, []);
  return data ? <StoreMapCoordinatePicker {...data} onChange={(position) => window.parent.postMessage({ type: 'mt-store-map:location-changed', position }, window.location.origin)} />
    : <p role="status">Завантажуємо координати заявки…</p>;
}
