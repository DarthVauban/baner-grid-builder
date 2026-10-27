import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoreMapCoordinatePicker } from './StoreMapCoordinatePicker';

const runtime = vi.hoisted(() => ({ maps: [] as unknown[] }));
vi.mock('maplibre-gl', () => {
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() });
  class Map {
    center: number[];
    zoom: number;
    moving = false;
    events = new globalThis.Map<string, Set<() => void>>();
    dragPan = handler(); scrollZoom = handler(); keyboard = handler(); doubleClickZoom = handler();
    boxZoom = handler(); dragRotate = handler(); touchZoomRotate = handler(); touchPitch = handler();
    source = { setData: vi.fn() };
    constructor(options: { center: number[]; zoom: number }) { this.center = options.center; this.zoom = options.zoom; runtime.maps.push(this); }
    on(name: string, callback: () => void) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name)!.add(callback); return this; }
    off(name: string, callback: () => void) { this.events.get(name)?.delete(callback); return this; }
    emit(name: string) { this.events.get(name)?.forEach((callback) => callback()); }
    getCenter() { return { wrap: () => ({ lng: this.center[0], lat: this.center[1] }) }; }
    getZoom() { return this.zoom; }
    isMoving() { return this.moving; }
    getSource() { return this.source; }
    addControl = vi.fn(); addSource = vi.fn(); addLayer = vi.fn(); resize = vi.fn(); remove = vi.fn();
    jumpTo = vi.fn((options: { center: number[]; zoom?: number }) => {
      this.moving = true;
      this.emit('movestart');
      this.center = options.center;
      this.zoom = options.zoom ?? this.zoom;
      this.moving = false;
      this.emit('moveend');
      return this;
    });
  }
  class Marker {
    element = document.createElement('div');
    setLngLat() { return this; } addTo() { return this; } getElement() { return this.element; } remove() {}
  }
  return { Map, Marker, NavigationControl: class {}, setWorkerUrl: vi.fn() };
});

interface MapStub {
  center: number[]; moving: boolean; emit: (event: string) => void;
  jumpTo: ReturnType<typeof vi.fn>; dragPan: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
}
const measurement = Object.freeze({ latitude: 50.45, longitude: 30.52, accuracy: 7,
  observedAt: '2026-10-27T12:00:00.000Z', sampleCount: 3, durationMs: 60000, consistent: true });
const position = { latitude: 50.45, longitude: 30.52 };
beforeEach(() => {
  runtime.maps.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const currentMap = () => runtime.maps.at(-1) as MapStub;

it('commits the map centre only after a pan ends and unblocks the form after publishing coordinates', () => {
  const events: unknown[] = [];
  const onChange = vi.fn((next) => events.push(next));
  const onMovingChange = vi.fn((moving) => events.push(moving));
  render(<StoreMapCoordinatePicker position={position} measurement={measurement} editable onChange={onChange} onMovingChange={onMovingChange} />);
  const map = currentMap();
  act(() => { map.moving = true; map.emit('movestart'); map.center = [30.5212345, 50.4512345]; });
  expect(screen.getByLabelText('Карта розташування магазину')).toHaveAttribute('aria-busy', 'true');
  expect(onChange).not.toHaveBeenCalled();
  act(() => { map.moving = false; map.emit('moveend'); });
  expect(events).toEqual([true, { latitude: 50.4512345, longitude: 30.5212345 }, false]);
  expect(measurement).toMatchObject({ latitude: 50.45, longitude: 30.52, accuracy: 7 });
});

it('keeps panning through unchanged parent updates and recentres numeric edits without feedback', () => {
  const onChange = vi.fn();
  const onMovingChange = vi.fn();
  const view = render(<StoreMapCoordinatePicker position={position} measurement={measurement} editable onChange={onChange} onMovingChange={onMovingChange} />);
  const map = currentMap();
  act(() => { map.moving = true; map.emit('movestart'); map.center = [30.53, 50.46]; });
  view.rerender(<StoreMapCoordinatePicker position={{ ...position }} measurement={{ ...measurement }} editable onChange={onChange} onMovingChange={onMovingChange} />);
  expect(map.jumpTo).not.toHaveBeenCalled();
  view.rerender(<StoreMapCoordinatePicker position={{ latitude: 50.47, longitude: 30.54 }} measurement={{ ...measurement }} editable onChange={onChange} onMovingChange={onMovingChange} />);
  expect(map.center).toEqual([30.54, 50.47]);
  expect(onChange).not.toHaveBeenCalled();
  expect(onMovingChange).toHaveBeenLastCalledWith(false);
  view.rerender(<StoreMapCoordinatePicker position={position} measurement={measurement} editable onChange={onChange} onMovingChange={onMovingChange} />);
  expect(map.center).toEqual([30.52, 50.45]);
  expect(onChange).not.toHaveBeenCalled();
});

it('does not invalidate a confirmed location when the map only resizes', () => {
  const onChange = vi.fn();
  const onMovingChange = vi.fn();
  render(<StoreMapCoordinatePicker position={position} measurement={measurement} editable onChange={onChange} onMovingChange={onMovingChange} />);
  const map = currentMap();
  act(() => { map.emit('movestart'); map.emit('moveend'); });
  expect(onMovingChange).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('locks read-only positioning and clears the moving state when an active picker unmounts', () => {
  const onChange = vi.fn();
  const onMovingChange = vi.fn();
  const view = render(<StoreMapCoordinatePicker position={position} measurement={measurement} editable={false} onChange={onChange} onMovingChange={onMovingChange} />);
  const map = currentMap();
  expect(map.dragPan.disable).toHaveBeenCalled();
  act(() => { map.emit('movestart'); map.emit('moveend'); });
  expect(onChange).not.toHaveBeenCalled();
  view.rerender(<StoreMapCoordinatePicker position={position} measurement={measurement} editable onChange={onChange} onMovingChange={onMovingChange} />);
  expect(map.dragPan.enable).toHaveBeenCalled();
  act(() => { map.moving = true; map.emit('movestart'); });
  view.unmount();
  expect(onMovingChange).toHaveBeenLastCalledWith(false);
});
