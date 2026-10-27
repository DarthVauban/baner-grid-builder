import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestLocationSample, locationDistance, useStoreMapLocation, validLocationSample } from './store-map-location';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('precise store-map location', () => {
  it('uses the most accurate corroborated fresh fix and rejects a distant isolated outlier', () => {
    const samples = [
      { latitude: 50.45, longitude: 30.52, accuracy: 20, timestamp: 1000 },
      { latitude: 50.45001, longitude: 30.52001, accuracy: 6, timestamp: 2000 },
      { latitude: 40, longitude: 20, accuracy: 1, timestamp: 3000 }
    ];
    expect(bestLocationSample(samples)).toEqual({ best: samples[1], consistent: true });
    expect(bestLocationSample([samples[0]]).consistent).toBe(false);
    expect(locationDistance(samples[0], samples[1])).toBeLessThan(2);
    expect(validLocationSample({ ...samples[0], timestamp: 0 }, 100000, 100000)).toBe(false);
    expect(validLocationSample({ ...samples[0], accuracy: 0, timestamp: 100000 }, 100000, 100000)).toBe(false);
  });

  function setup() {
    vi.useFakeTimers();
    vi.stubGlobal('isSecureContext', true);
    let success: PositionCallback = () => {};
    let failure: PositionErrorCallback = () => {};
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((onSuccess: PositionCallback, onError: PositionErrorCallback) => { success = onSuccess; failure = onError; return 41; });
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
    const hook = renderHook(() => useStoreMapLocation());
    const fix = (accuracy: number, timestamp = Date.now()) => act(() => success({
      timestamp, coords: { latitude: 50.45, longitude: 30.52, accuracy }
    } as GeolocationPosition));
    return { ...hook, fix, clearWatch, watchPosition, fail: (code: number) => act(() => failure({ code } as GeolocationPositionError)) };
  }

  it('requests high accuracy without cached positions, ignores duplicates and stops after 60 seconds', () => {
    const hook = setup();
    act(() => hook.result.current.start());
    expect(hook.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    hook.fix(100, Date.now() - 100000);
    expect(hook.result.current.measurement).toBeNull();
    hook.fix(40);
    hook.fix(40);
    act(() => vi.advanceTimersByTime(5000));
    hook.fix(7);
    hook.fail(3);
    expect(hook.result.current.measurement?.accuracy).toBe(7);
    expect(hook.result.current.measurement?.sampleCount).toBe(2);
    act(() => vi.advanceTimersByTime(55000));
    expect(hook.result.current.running).toBe(false);
    expect(hook.result.current.measurement?.durationMs).toBe(60000);
    expect(hook.result.current.measurement?.consistent).toBe(true);
    expect(hook.clearWatch).toHaveBeenCalledWith(41);
    hook.fix(1);
    expect(hook.result.current.measurement?.accuracy).toBe(7);
  });

  it('handles permission denial and cancels sensor watching and timers on unmount', () => {
    const hook = setup();
    act(() => hook.result.current.start());
    hook.fail(1);
    expect(hook.result.current.error).toContain('Доступ до геолокації заборонено');
    expect(hook.result.current.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => hook.result.current.start());
    hook.unmount();
    expect(hook.clearWatch).toHaveBeenCalledWith(41);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports synchronous browser failures and finishes without an invented position', () => {
    const hook = setup();
    hook.watchPosition.mockImplementationOnce(() => { throw new Error('blocked'); });
    act(() => hook.result.current.start());
    expect(hook.result.current.error).toContain('Браузер не дозволив');
    expect(hook.result.current.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => hook.result.current.start());
    act(() => vi.advanceTimersByTime(60_000));
    expect(hook.result.current.measurement).toBeNull();
    expect(hook.result.current.error).toContain('Не вдалося отримати свіжі координати');
    hook.unmount();
  });
});
