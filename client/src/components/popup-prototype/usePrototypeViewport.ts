import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

type Point = { x: number; y: number };
type View = Point & { zoom: number | null };
type Size = { width: number; height: number; sceneHeight: number };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function fitScale(size: Size, sceneWidth: number) {
  return Math.min(1, Math.max(1, size.width - 24) / sceneWidth, Math.max(1, size.height - 24) / size.sceneHeight);
}
function limitPan(view: View, size: Size, sceneWidth: number): View {
  const scale = view.zoom ?? fitScale(size, sceneWidth);
  const limitX = Math.max(64, (sceneWidth * scale - size.width) / 2 + 64);
  const limitY = Math.max(64, (size.sceneHeight * scale - size.height) / 2 + 64);
  return { ...view, x: clamp(view.x, -limitX, limitX), y: clamp(view.y, -limitY, limitY) };
}

export function usePrototypeViewport(sceneWidth: number, resetKey: string) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ zoom: null, x: 0, y: 0 });
  const sizeRef = useRef<Size>({ width: 1, height: 1, sceneHeight: 1 });
  const [view, setView] = useState(viewRef.current);
  const [size, setSize] = useState(sizeRef.current);
  const [handTool, setHandTool] = useState(false);
  const handRef = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const commit = useCallback((next: View) => {
    viewRef.current = limitPan(next, sizeRef.current, sceneWidth);
    setView(viewRef.current);
  }, [sceneWidth]);
  const fit = useCallback(() => commit({ zoom: null, x: 0, y: 0 }), [commit]);
  const setZoom = useCallback((zoom: number, anchor?: Point) => {
    const current = viewRef.current;
    const dimensions = sizeRef.current;
    const previousScale = current.zoom ?? fitScale(dimensions, sceneWidth);
    const nextScale = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const point = anchor || { x: dimensions.width / 2, y: dimensions.height / 2 };
    const offsetX = point.x - dimensions.width / 2;
    const offsetY = point.y - dimensions.height / 2;
    commit({ zoom: nextScale, x: offsetX - (offsetX - current.x) * nextScale / previousScale, y: offsetY - (offsetY - current.y) * nextScale / previousScale });
  }, [commit, sceneWidth]);
  const zoomBy = useCallback((factor: number, anchor?: Point) => setZoom((viewRef.current.zoom ?? fitScale(sizeRef.current, sceneWidth)) * factor, anchor), [setZoom, sceneWidth]);

  useLayoutEffect(() => { handRef.current = handTool; }, [handTool]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const scene = sceneRef.current;
    if (!viewport || !scene) return;
    viewRef.current = { zoom: null, x: 0, y: 0 };
    const measure = () => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      sizeRef.current = { width: viewport.clientWidth, height: viewport.clientHeight, sceneHeight: Math.max(1, scene.offsetHeight) };
      setSize(sizeRef.current);
      commit(viewRef.current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(scene);
    measure();
    return () => observer.disconnect();
  }, [sceneWidth, resetKey, commit]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let space = false;
    let drag: { id: number; origin: Point; pan: Point } | null = null;
    let suppressClick = false;
    const touches = new Map<number, Point>();
    let pinch: { distance: number; center: Point } | null = null;
    const local = (point: Point) => { const rect = viewport.getBoundingClientRect(); return { x: point.x - rect.left, y: point.y - rect.top }; };
    const pinchPoints = () => {
      const [a, b] = [...touches.values()];
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const down = (event: PointerEvent) => {
      suppressClick = false;
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
          pinch = pinchPoints(); drag = null; suppressClick = true; setGrabbing(true);
          for (const id of touches.keys()) viewport.setPointerCapture(id);
          event.preventDefault(); event.stopPropagation(); return;
        }
      }
      const target = event.target as HTMLElement;
      if (event.button !== 1 && !(event.button === 0 && (space || handRef.current || !target.closest('.pp-sample-banner, .pp-closed')))) return;
      viewport.focus({ preventScroll: true });
      drag = { id: event.pointerId, origin: { x: event.clientX, y: event.clientY }, pan: viewRef.current };
      viewport.setPointerCapture(event.pointerId);
      setGrabbing(true);
      event.preventDefault(); event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && touches.size === 2) {
        const next = pinchPoints();
        zoomBy(next.distance / pinch.distance, local(pinch.center));
        commit({ ...viewRef.current, x: viewRef.current.x + next.center.x - pinch.center.x, y: viewRef.current.y + next.center.y - pinch.center.y });
        pinch = next; suppressClick = true; event.preventDefault(); return;
      }
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.origin.x, dy = event.clientY - drag.origin.y;
      if (Math.hypot(dx, dy) > 3) suppressClick = true;
      commit({ ...viewRef.current, x: drag.pan.x + dx, y: drag.pan.y + dy });
    };
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (pinch || drag?.id === event.pointerId) { pinch = null; drag = null; setGrabbing(false); }
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    const click = (event: MouseEvent) => { if (suppressClick || space || handRef.current) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) zoomBy(Math.exp(-clamp(event.deltaY * multiplier, -200, 200) * 0.008), local({ x: event.clientX, y: event.clientY }));
      else commit({ ...viewRef.current, x: viewRef.current.x - (event.shiftKey ? event.deltaY : event.deltaX) * multiplier, y: viewRef.current.y - (event.shiftKey ? 0 : event.deltaY) * multiplier });
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, [contenteditable=true], [role=combobox]')) return;
      if (!viewport.contains(target) && !viewport.matches(':hover')) return;
      if (event.code === 'Space') { space = true; setSpaceHeld(true); event.preventDefault(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
      else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (event.key === '1') { event.preventDefault(); setZoom(1); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); commit({ ...viewRef.current, x: viewRef.current.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), y: viewRef.current.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) });
      }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { space = false; setSpaceHeld(false); } };
    const blur = () => { space = false; drag = null; pinch = null; touches.clear(); setSpaceHeld(false); setGrabbing(false); };
    viewport.addEventListener('pointerdown', down, true);
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', up);
    viewport.addEventListener('lostpointercapture', up);
    viewport.addEventListener('click', click, true);
    viewport.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      viewport.removeEventListener('pointerdown', down, true);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', up);
      viewport.removeEventListener('pointercancel', up);
      viewport.removeEventListener('lostpointercapture', up);
      viewport.removeEventListener('click', click, true);
      viewport.removeEventListener('wheel', wheel);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [commit, fit, setZoom, zoomBy]);

  const scale = view.zoom ?? fitScale(size, sceneWidth);
  const sceneStyle: CSSProperties = { width: sceneWidth, transform: `translate(${(size.width - sceneWidth * scale) / 2 + view.x}px, ${(size.height - size.sceneHeight * scale) / 2 + view.y}px) scale(${scale})` };
  return { viewportRef, sceneRef, sceneStyle, scale, isFit: view.zoom === null, handTool, setHandTool, grabbing, spaceHeld, fit, setZoom, zoomBy };
}
