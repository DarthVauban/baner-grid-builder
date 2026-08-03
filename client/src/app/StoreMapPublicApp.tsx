import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PublicStoreMapData, StoreMapPoint, StoreMapSchedule } from '../types/store-map';

const defaultMarkerSvg = `<svg viewBox="0 0 42 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M21 1C10.5 1 2 9.5 2 20c0 14.8 19 31 19 31s19-16.2 19-31C40 9.5 31.5 1 21 1Z" fill="#FFE101" stroke="#111827" stroke-width="2"/>
  <circle cx="21" cy="20" r="8.5" fill="#111827"/>
  <path d="m16.5 20 3 3 6-6" fill="none" stroke="#FFE101" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function currentKyivClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: values.weekday.toLowerCase().slice(0, 3),
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function isOpen(point: StoreMapPoint, now: Date) {
  if (point.openStatusOverride === 'TEMPORARILY_CLOSED' || point.openStatusOverride === 'CLOSED') return false;
  const schedule = point.schedule as StoreMapSchedule;
  const clock = currentKyivClock(now);
  const intervals = schedule.days?.[clock.day] || [];
  return intervals.some((interval) => {
    const open = timeToMinutes(interval.open);
    const close = timeToMinutes(interval.close);
    if (open === null || close === null) return false;
    if (open === close) return true;
    return close > open
      ? clock.minutes >= open && clock.minutes < close
      : clock.minutes >= open || clock.minutes < close;
  });
}

function operatingStatus(point: StoreMapPoint) {
  if (point.openStatusOverride === 'TEMPORARILY_CLOSED') {
    return { label: 'Тимч. зачинено', modifier: 'temporary' };
  }
  if (point.openStatusOverride === 'CLOSED') {
    return { label: 'Зачинено', modifier: 'closed' };
  }
  return { label: 'За розкладом', modifier: 'schedule' };
}

function routeUrl(point: StoreMapPoint) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character] || character);
}

function popupMarkup(point: StoreMapPoint) {
  const status = operatingStatus(point);
  return `<article class="store-map-popup">
    <div class="store-map-popup__heading">
      <strong>${escapeHtml(point.name)}</strong>
      <span class="store-map-popup__status store-map-popup__status--${status.modifier}">${status.label}</span>
    </div>
    <p><span aria-hidden="true">⌖</span>${escapeHtml(point.address)}</p>
    <p><span aria-hidden="true">◷</span>${escapeHtml(point.hoursText || 'Графік уточнюється')}</p>
    <a href="${routeUrl(point)}" target="_blank" rel="noreferrer">Прокласти маршрут</a>
  </article>`;
}

export function StoreMapPublicApp() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const markerRefs = useRef(new Map<string, L.Marker>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [data, setData] = useState<PublicStoreMapData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('ALL');
  const [openFilter, setOpenFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    const previewToken = new URLSearchParams(window.location.search).get('preview');
    const dataUrl = previewToken
      ? `/api/public/store-map?preview=${encodeURIComponent(previewToken)}`
      : '/api/public/store-map';
    fetch(dataUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не вдалося завантажити торгові точки.');
        const payload = await response.json() as { data: PublicStoreMapData };
        setData(payload.data);
        document.title = payload.data.settings.title;
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Не вдалося завантажити карту.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sendHeight = () => {
      window.parent.postMessage({
        type: 'mt-store-map:height',
        height: Math.ceil(document.documentElement.getBoundingClientRect().height)
      }, '*');
    };
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.documentElement);
    sendHeight();
    return () => observer.disconnect();
  }, []);

  const filteredPoints = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uk-UA');
    return (data?.points || []).filter((point) => {
      const opened = isOpen(point, clock);
      return (city === 'ALL' || point.city === city)
        && (openFilter === 'ALL' || (openFilter === 'OPEN' ? opened : !opened))
        && (!needle || `${point.name} ${point.city}`.toLocaleLowerCase('uk-UA').includes(needle));
    });
  }, [city, clock, data?.points, openFilter, search]);
  useEffect(() => {
    if (!data || !mapElementRef.current || mapRef.current) return;
    const map = L.map(mapElementRef.current, {
      center: [data.settings.centerLatitude, data.settings.centerLongitude],
      zoom: data.settings.defaultZoom,
      zoomControl: true,
      scrollWheelZoom: true
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (!data || !mapRef.current || !markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    markerRefs.current.clear();
    const svg = data.settings.markerSvg || defaultMarkerSvg;
    filteredPoints.forEach((point) => {
      const selected = point.id === selectedId;
      const icon = L.divIcon({
        className: `store-map-leaflet-icon${selected ? ' store-map-leaflet-icon--selected' : ''}`,
        html: `<span class="store-map-leaflet-icon__art">${svg}</span>`,
        iconSize: [data.settings.markerWidth, data.settings.markerHeight],
        iconAnchor: [data.settings.markerAnchorX, data.settings.markerAnchorY]
      });
      const marker = L.marker([point.latitude, point.longitude], {
        icon,
        title: point.name,
        keyboard: true
      }).addTo(markerLayerRef.current!);
      marker.bindPopup(popupMarkup(point), {
        className: 'store-map-leaflet-popup',
        minWidth: 240,
        maxWidth: 290,
        offset: [0, -8],
        autoPanPadding: [24, 24]
      });
      markerRefs.current.set(point.id, marker);
      marker.on('click', () => {
        setSelectedId(point.id);
        cardRefs.current.get(point.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      if (selected) {
        marker.setZIndexOffset(1000);
        marker.openPopup();
      }
    });
  }, [clock, data, filteredPoints, selectedId]);

  useEffect(() => {
    if (!data || !mapRef.current) return;
    if (!filteredPoints.length) {
      mapRef.current.setView(
        [data.settings.centerLatitude, data.settings.centerLongitude],
        data.settings.defaultZoom
      );
      return;
    }
    if (filteredPoints.length === 1) {
      mapRef.current.setView([filteredPoints[0].latitude, filteredPoints[0].longitude], 15);
      return;
    }
    const bounds = L.latLngBounds(filteredPoints.map((point) => [point.latitude, point.longitude]));
    mapRef.current.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
  }, [data, filteredPoints]);

  function selectPoint(point: StoreMapPoint) {
    setSelectedId(point.id);
    markerRefs.current.get(point.id)?.openPopup();
    mapRef.current?.flyTo([point.latitude, point.longitude], Math.max(mapRef.current.getZoom(), 15), {
      duration: 0.6
    });
  }

  if (error) return <main className="store-map-widget-state store-map-widget-state--error"><strong>Мапа тимчасово недоступна</strong><span>{error}</span></main>;
  if (!data) return <main className="store-map-widget-state"><span className="store-map-widget-loader" /><strong>Завантажуємо мапу магазинів…</strong></main>;

  return <main className="store-map-widget">
    <section className="store-map-widget__map" aria-label="Мапа торгових точок">
      <div ref={mapElementRef} className="store-map-widget__map-canvas" />
      <span className="store-map-widget__count">{filteredPoints.length} ТТ</span>
    </section>
    <aside className="store-map-widget__directory" aria-label="Список торгових точок">
      <header className="store-map-widget__filters">
        <label className="store-map-widget__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук магазину…" aria-label="Пошук магазину" />
        </label>
        <div>
          <select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Місто">
            <option value="ALL">Всі локації</option>
            {data.cities.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <select value={openFilter} onChange={(event) => setOpenFilter(event.target.value as typeof openFilter)} aria-label="Статус">
            <option value="ALL">Всі статуси</option>
            <option value="OPEN">Відкриті</option>
            <option value="CLOSED">Закриті</option>
          </select>
        </div>
      </header>
      <div className="store-map-widget__list">
        {!filteredPoints.length && <div className="store-map-widget__empty"><strong>Нічого не знайдено</strong><span>Змініть пошук або фільтри.</span></div>}
        {filteredPoints.map((point) => {
          const status = operatingStatus(point);
          return <article
            ref={(node) => {
              if (node) cardRefs.current.set(point.id, node);
              else cardRefs.current.delete(point.id);
            }}
            className={`store-map-widget-card${selectedId === point.id ? ' store-map-widget-card--selected' : ''}`}
            onClick={() => selectPoint(point)}
            key={point.id}
          >
            <div className="store-map-widget-card__heading">
              <h2>{point.name}</h2>
              <span className={`store-map-widget-status store-map-widget-status--${status.modifier}`}>{status.label}</span>
            </div>
            <p><span aria-hidden="true">⌖</span>{point.address}</p>
            <div className="store-map-widget-card__footer">
              <span><span aria-hidden="true">◷</span>{point.hoursText || 'Графік уточнюється'}</span>
              <a href={routeUrl(point)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Маршрут</a>
            </div>
          </article>;
        })}
      </div>
    </aside>
  </main>;
}
