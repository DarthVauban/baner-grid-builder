import { useEffect, useRef, useState } from 'react';
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
  const marker = useRef<Marker | null>(null);
  const measuredMarker = useRef<Marker | null>(null);
  const latest = useRef(props);
  const [error, setError] = useState('');
  useEffect(() => { latest.current = props; });

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
    const pin = document.createElement('div');
    pin.className = 'store-map-coordinate-pin';
    pin.style.zIndex = '3';
    pin.title = 'Маркер магазину';
    pin.setAttribute('aria-label', 'Розташування магазину');
    const selected = new Marker({ element: pin, draggable: current.editable }).setLngLat([current.position.longitude, current.position.latitude]).addTo(instance);
    marker.current = selected;
    const measured = new Marker({ color: '#1674d1', scale: 0.65 }).setLngLat([current.measurement.longitude, current.measurement.latitude]).addTo(instance);
    measuredMarker.current = measured;
    measured.getElement().style.zIndex = '1';
    selected.on('dragend', () => {
      if (!latest.current.editable) return;
      const position = selected.getLngLat();
      latest.current.onChange({ latitude: Math.max(-90, Math.min(90, position.lat)), longitude: position.wrap().lng });
    });
    instance.on('click', (event) => {
      if (latest.current.editable) latest.current.onChange({ latitude: event.lngLat.lat, longitude: event.lngLat.wrap().lng });
    });
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
      selected.remove();
      measured.remove();
      instance.remove();
      map.current = null;
      marker.current = null;
      measuredMarker.current = null;
    };
  }, []);

  useEffect(() => {
    marker.current?.setLngLat([props.position.longitude, props.position.latitude]).setDraggable(props.editable);
    measuredMarker.current?.setLngLat([props.measurement.longitude, props.measurement.latitude]);
    const instance = map.current;
    const source = instance?.getSource('measurement-accuracy') as GeoJSONSource | undefined;
    source?.setData(accuracyCircle(props.measurement));
    if (instance && !props.editable) instance.jumpTo({ center: [props.position.longitude, props.position.latitude],
      zoom: Math.min(18, Math.max(4, 17 - Math.log2(Math.max(10, props.measurement.accuracy) / 10))) });
  }, [props.position.latitude, props.position.longitude, props.measurement, props.editable]);

  return <div className="store-map-coordinate-picker">
    <div className="store-map-coordinate-canvas" ref={container} aria-label="Карта розташування магазину" />
    <p className="store-map-coordinate-legend"><span>●</span> Замір і радіус похибки <b>●</b> Маркер магазину</p>
    {props.editable && <p className="store-map-coordinate-help">Перетягніть фіолетовий маркер або натисніть на карту, щоб позначити вхід до магазину.</p>}
    {error && <p role="status" className="store-map-coordinate-error">{error}</p>}
  </div>;
}
