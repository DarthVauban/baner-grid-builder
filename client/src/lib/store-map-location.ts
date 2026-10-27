import { useEffect, useRef, useState } from 'react';
import type { StoreMapMeasurement, StoreMapPosition } from '../types/store-map';

export interface LocationSample extends StoreMapPosition { accuracy: number; timestamp: number }

export function locationDistance(a: StoreMapPosition, b: StoreMapPosition) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lng = (b.longitude - a.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function bestLocationSample(samples: LocationSample[]) {
  const supported = samples.filter((sample, index) => samples.some((other, otherIndex) =>
    index !== otherIndex && locationDistance(sample, other) <= Math.max(10, sample.accuracy + other.accuracy)));
  const candidates = supported.length ? supported : samples;
  const best = candidates.reduce<LocationSample | null>((current, sample) =>
    !current || sample.accuracy < current.accuracy || (sample.accuracy === current.accuracy && sample.timestamp > current.timestamp) ? sample : current, null);
  return { best, consistent: supported.length >= 2 };
}

export function validLocationSample(sample: LocationSample, startedAt: number, now: number) {
  return Number.isFinite(sample.latitude) && Math.abs(sample.latitude) <= 90
    && Number.isFinite(sample.longitude) && Math.abs(sample.longitude) <= 180
    && Number.isFinite(sample.accuracy) && sample.accuracy > 0 && sample.accuracy <= 1_000_000
    && Number.isFinite(sample.timestamp) && sample.timestamp >= startedAt - 1000
    && sample.timestamp <= now + 5000 && now - sample.timestamp <= 60_000;
}

export function useStoreMapLocation() {
  const [measurement, setMeasurement] = useState<StoreMapMeasurement | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const cleanup = useRef<() => void>(() => {});
  const finishCapture = useRef<() => void>(() => {});
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; cleanup.current(); }, []);

  function start() {
    cleanup.current();
    const currentGeneration = ++generation.current;
    setMeasurement(null);
    setElapsed(0);
    setError('');
    if (!window.isSecureContext || !navigator.geolocation) {
      setRunning(false);
      setError('Для геолокації відкрийте HTTPS-посилання у браузері телефону з підтримкою місцезнаходження.');
      return;
    }
    setRunning(true);
    const geolocation = navigator.geolocation;
    const startedAt = Date.now();
    const samples: LocationSample[] = [];
    let watch: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = true;
    const clear = () => {
      if (!active) return;
      active = false;
      if (watch !== undefined) geolocation.clearWatch(watch);
      if (timer !== undefined) clearInterval(timer);
    };
    cleanup.current = clear;
    const publish = () => {
      const { best, consistent } = bestLocationSample(samples);
      if (best) setMeasurement({ latitude: best.latitude, longitude: best.longitude, accuracy: best.accuracy,
        observedAt: new Date(best.timestamp).toISOString(), sampleCount: samples.length,
        durationMs: Math.min(60_000, Date.now() - startedAt), consistent });
      return Boolean(best);
    };
    const finish = () => {
      if (!active || generation.current !== currentGeneration) return;
      if (!publish()) setError('Не вдалося отримати свіжі координати. Перевірте дозвіл, увімкніть точну геолокацію та спробуйте біля входу до магазину.');
      clear();
      setRunning(false);
    };
    finishCapture.current = finish;
    timer = setInterval(() => {
      if (!active || generation.current !== currentGeneration) return;
      setElapsed(Math.min(60, Math.floor((Date.now() - startedAt) / 1000)));
      if (Date.now() - startedAt >= 60_000) finish();
    }, 1000);
    try {
      watch = geolocation.watchPosition((position) => {
        if (!active || generation.current !== currentGeneration) return;
        const sample = { latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, timestamp: position.timestamp };
        if (!validLocationSample(sample, startedAt, Date.now())) return;
        if (samples.some((item) => item.timestamp === sample.timestamp && item.latitude === sample.latitude
          && item.longitude === sample.longitude && item.accuracy === sample.accuracy)) return;
        samples.push(sample);
        if (samples.length > 120) samples.shift();
        publish();
      }, (failure) => {
        if (!active || generation.current !== currentGeneration) return;
        if (failure.code === 1) {
          clear();
          setRunning(false);
          setError('Доступ до геолокації заборонено. Дозвольте точне місцезнаходження в налаштуваннях браузера й повторіть замір.');
        }
        // Temporary errors do not discard a good sample or end the acquisition window.
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
      if (!active) geolocation.clearWatch(watch);
    } catch {
      clear();
      setRunning(false);
      setError('Браузер не дозволив запустити геолокацію. Відкрийте посилання в основному браузері телефону та перевірте дозвіл.');
    }
  }

  return { measurement, running, elapsed, error, start, finish: () => finishCapture.current() };
}
