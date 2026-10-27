import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { StoreMapMeasurement, StoreMapPosition } from '../types/store-map';

setWorkerUrl(`${mapLibreWorkerUrl}?store-map-csp=2`);

export interface StoreMapCoordinatePickerProps {
  position: StoreMapPosition;
  measurement: StoreMapMeasurement;
  editable: boolean;
  onChange: (position: StoreMapPosition) => void;
  onMovingChange?: (moving: boolean) => void;
}

function samePosition(a: StoreMapPosition, b: StoreMapPosition) {
  return Math.abs(a.latitude - b.latitude) < 0.0000001
    && Math.abs(((a.longitude - b.longitude + 540) % 360) - 180) < 0.0000001;
}

function accuracyCircle(measurement: StoreMapMeasurement) {
  const lat = measurement.latitude * Math.PI / 180;
  const lng = measurement.longitude * Math.PI / 180;
  const distance = measurement.accuracy / 6_371_008.8;
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const bearing = index / 64 * Math.PI * 2;
    const y = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const x = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(y));
    return [x * 180 / Math.PI, y * 180 / Math.PI];
  });
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [coordinates] } };
}

export function StoreMapCoordinatePicker(props: StoreMapCoordinatePickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const measuredMarker = useRef<Marker | null>(null);
  const latest = useRef(props);
  const syncing = useRef(false);
  const moving = useRef(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { latest.current = props; });

  const notifyMoving = useCallback((value: boolean) => {
    if (moving.current === value) return;
    moving.current = value;
    setIsMoving(value);
    latest.current.onMovingChange?.(value);
  }, []);

  const centerOnPosition = useCallback((position: StoreMapPosition, zoom?: number) => {
    const instance = map.current;
    if (!instance) return;
    const center = instance.getCenter().wrap();
    if (samePosition(position, { latitude: center.lat, longitude: center.lng })
      && (zoom === undefined || Math.abs(instance.getZoom() - zoom) < 0.001) && !instance.isMoving()) return;
    // Recentring from numeric fields, a reset or a GPS fix must not be treated as a manual selection.
    syncing.current = true;
    try { instance.jumpTo({ center: [position.longitude, position.latitude], ...(zoom === undefined ? {} : { zoom }) }); }
    finally { syncing.current = false; }
    notifyMoving(false);
  }, [notifyMoving]);

  useEffect(() => {
    if (!container.current) return;
    const current = latest.current;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({ container: container.current, style: 'https://tiles.openfreemap.org/styles/positron',
        center: [current.position.longitude, current.position.latitude], zoom: 17, attributionControl: { compact: true } });
    } catch {
      setError('Браузер не зміг відкрити карту. Спробуйте інший браузер або перевірте координати вручну.');
      return;
    }
    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const measured = new Marker({ color: '#1674d1', scale: 0.65 }).setLngLat([current.measurement.longitude, current.measurement.latitude]).addTo(instance);
    measuredMarker.current = measured;
    measured.getElement().style.zIndex = '1';
    const moveStart = () => {
      // MapLibre also emits movement events for resize(), without a camera/gesture movement.
      if (!syncing.current && latest.current.editable && instance.isMoving()) notifyMoving(true);
    };
    const moveEnd = () => {
      if (syncing.current || !moving.current) return;
      if (latest.current.editable) {
        const center = instance.getCenter().wrap();
        const position = { latitude: center.lat, longitude: center.lng };
        if (!samePosition(position, latest.current.position)) latest.current.onChange(position);
      }
      // Publish coordinates before unblocking the form, including across the review iframe.
      notifyMoving(false);
    };
    instance.on('movestart', moveStart);
    instance.on('moveend', moveEnd);
    instance.on('load', () => {
      instance.addSource('measurement-accuracy', { type: 'geojson', data: accuracyCircle(latest.current.measurement) });
      instance.addLayer({ id: 'measurement-fill', type: 'fill', source: 'measurement-accuracy', paint: { 'fill-color': '#1674d1', 'fill-opacity': 0.13 } });
      instance.addLayer({ id: 'measurement-outline', type: 'line', source: 'measurement-accuracy', paint: { 'line-color': '#1674d1', 'line-width': 2 } });
    });
    instance.on('error', () => setError('Не всі дані карти завантажилися. Перевірте інтернет або повторно відкрийте сторінку.'));
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.off('movestart', moveStart);
      instance.off('moveend', moveEnd);
      measured.remove();
      instance.remove();
      map.current = null;
      measuredMarker.current = null;
      notifyMoving(false);
    };
  }, [notifyMoving]);

  useEffect(() => {
    centerOnPosition({ latitude: props.position.latitude, longitude: props.position.longitude });
  }, [props.position.latitude, props.position.longitude, centerOnPosition]);

  useEffect(() => {
    measuredMarker.current?.setLngLat([props.measurement.longitude, props.measurement.latitude]);
    const instance = map.current;
    const source = instance?.getSource('measurement-accuracy') as GeoJSONSource | undefined;
    source?.setData(accuracyCircle(props.measurement));
    if (!latest.current.editable) centerOnPosition(latest.current.position,
      Math.min(18, Math.max(4, 17 - Math.log2(Math.max(10, props.measurement.accuracy) / 10))));
  }, [props.measurement, centerOnPosition]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const action = props.editable ? 'enable' : 'disable';
    instance.dragPan[action]();
    instance.scrollZoom[action]();
    instance.keyboard[action]();
    instance.doubleClickZoom[action]();
    instance.boxZoom[action]();
    instance.dragRotate[action]();
    instance.touchZoomRotate[action]();
    instance.touchPitch[action]();
    if (!props.editable) centerOnPosition(latest.current.position);
  }, [props.editable, centerOnPosition]);

  return <div className="store-map-coordinate-picker">
    <div className={`store-map-coordinate-viewport${props.editable ? ' is-editable' : ''}${isMoving ? ' is-moving' : ''}`}>
      <div className="store-map-coordinate-canvas" ref={container} aria-label="Карта розташування магазину" aria-busy={isMoving} />
      <div className="store-map-coordinate-pin" role="img" aria-label="Маркер магазину в центрі карти" />
    </div>
    <p className="store-map-coordinate-legend"><span>●</span> Замір і радіус похибки <b>●</b> Маркер магазину — центр карти</p>
    {props.editable && <p className="store-map-coordinate-help">Пересувайте карту під фіолетовим маркером у центрі. Відпустіть карту, щоб зафіксувати вхід до магазину.</p>}
    {error && <p role="status" className="store-map-coordinate-error">{error}</p>}
  </div>;
}
