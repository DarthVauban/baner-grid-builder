import { useEffect, useRef } from 'react';
import type { StoreMapMeasurement, StoreMapPosition } from '../types/store-map';

export interface StoreMapLocationFrameData {
  position: StoreMapPosition;
  measurement: StoreMapMeasurement;
  editable: boolean;
}

export function StoreMapLocationFrame({ data, onChange, onMovingChange }: {
  data: StoreMapLocationFrameData; onChange: (position: StoreMapPosition) => void; onMovingChange?: (moving: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef({ data, onChange, onMovingChange });
  useEffect(() => {
    current.current = { data, onChange, onMovingChange };
    frame.current?.contentWindow?.postMessage({ type: 'mt-store-map:location-data', data }, window.location.origin);
  }, [data, onChange, onMovingChange]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'mt-store-map:location-ready') {
        frame.current?.contentWindow?.postMessage({ type: 'mt-store-map:location-data', data: current.current.data }, window.location.origin);
      }
      if (event.data?.type === 'mt-store-map:location-changed' && current.current.data.editable) {
        const position = event.data.position;
        if (position && Number.isFinite(position.latitude) && Math.abs(position.latitude) <= 90
          && Number.isFinite(position.longitude) && Math.abs(position.longitude) <= 180) current.current.onChange(position);
      }
      if (event.data?.type === 'mt-store-map:location-moving' && typeof event.data.moving === 'boolean') {
        current.current.onMovingChange?.(current.current.data.editable && event.data.moving);
      }
    };
    window.addEventListener('message', message);
    return () => { window.removeEventListener('message', message); current.current.onMovingChange?.(false); };
  }, []);
  return <iframe className="store-map-location-frame" ref={frame} src="/store-map/location-preview" title="Карта координат заявки"
    onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'mt-store-map:location-data', data: current.current.data }, window.location.origin)} />;
}
