'use client';

import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type DragEvent, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import './editor-viewport.css';

type View = { x: number; y: number; scale: number };
type ArtboardSize = { width: number; height: number };
type ArtboardResize = {
  scope: string; minWidth: number; maxWidth: number; minHeight: number; maxHeight: number; disabled?: boolean;
  onChange: (size: ArtboardSize) => void; onInteractionStart?: () => void; onInteractionEnd?: () => void;
};
export type EditorViewportHandle = { fit: () => void; setScale: (scale: number) => void; getScale: () => number };
type Controller = EditorViewportHandle & { syncSize: () => void; destroy: () => void };
const clampScale = (value: number) => Math.max(.2, Math.min(1.5, value));
const GRID_STEP = 10;

/** RAF moves the camera without rebuilding document content; the browser paints at the current scale. */
export const EditorViewport = forwardRef<EditorViewportHandle, {
  width: number; height: number; children: ReactNode; onScaleChange: (scale: number) => void;
  label?: string; artboardLabel?: string; onMarqueeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFilesDrop?: (files: File[], event: DragEvent<HTMLDivElement>) => void; fileDropDisabled?: boolean; fileDropHint?: string;
  artboardResize?: ArtboardResize;
}>(function EditorViewport({ width, height, children, onScaleChange, label = 'Робоча область редактора', artboardLabel, onMarqueeStart, onFilesDrop, fileDropDisabled = false, fileDropHint = 'Відпустіть зображення на полотні', artboardResize }, ref) {
  const root = useRef<HTMLDivElement>(null); const controller = useRef<Controller | null>(null); const hint = useId();
  const latest = useRef({ width, height, onScaleChange, artboardResize });
  useLayoutEffect(() => { latest.current = { width, height, onScaleChange, artboardResize }; controller.current?.syncSize(); });
  const fileDepth = useRef(0); const [fileDragging, setFileDragging] = useState(false);
  if (fileDragging && (fileDropDisabled || !onFilesDrop)) setFileDragging(false);
  useLayoutEffect(() => { if (fileDropDisabled || !onFilesDrop) fileDepth.current = 0; }, [fileDropDisabled, onFilesDrop]);
  const hasFiles = (event: DragEvent<HTMLDivElement>) => event.dataTransfer.types.includes('Files') || event.dataTransfer.files.length > 0;
  useImperativeHandle(ref, () => ({ fit: () => controller.current?.fit(), setScale: value => controller.current?.setScale(value), getScale: () => controller.current?.getScale() ?? 1 }), []);
  useLayoutEffect(() => {
    const host = root.current; if (!host) return;
    let view: View = { x: 0, y: 0, scale: 1 }; let target = { ...view }; let frame = 0;
    let pan: { pointer: number; x: number; y: number; start: View } | null = null;
    let sizing: { axis: keyof ArtboardSize; pointer: number; button: HTMLButtonElement; start: number; scale: number; before: ArtboardSize; last: ArtboardSize; config: ArtboardResize } | null = null;
    let dimensions = { width: latest.current.width, height: latest.current.height };
    let pendingSize: ArtboardSize | null = null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function paint() {
      host!.style.setProperty('--ui-editor-view-x', `${view.x}px`); host!.style.setProperty('--ui-editor-view-y', `${view.y}px`);
      host!.style.setProperty('--ui-editor-view-scale', String(view.scale));
    }
    function stopAnimation() {
      if (!frame) return;
      cancelAnimationFrame(frame); frame = 0; target = { ...view }; latest.current.onScaleChange(view.scale);
    }
    function transition(next: View, immediate = false) {
      cancelAnimationFrame(frame); frame = 0; target = { ...next }; latest.current.onScaleChange(next.scale);
      const from = { ...view }; const start = performance.now();
      const motion = getComputedStyle(host!).getPropertyValue('--motion-fast').trim().match(/^(\d*\.?\d+)(ms|s)$/);
      // CSS optimizers may serialize 140ms as .14s; RAF timestamps are always milliseconds.
      const milliseconds = motion ? Number(motion[1]) * (motion[2] === 's' ? 1000 : 1) : 140;
      const duration = immediate || reduced.matches ? 0 : milliseconds;
      if (!duration) { view = { ...next }; paint(); return; }
      function tick(now: number) {
        const progress = Math.min(1, Math.max(0, (now - start) / duration)); const eased = 1 - (1 - progress) ** 3;
        view = { x: from.x + (next.x - from.x) * eased, y: from.y + (next.y - from.y) * eased, scale: from.scale + (next.scale - from.scale) * eased };
        paint(); frame = progress < 1 ? requestAnimationFrame(tick) : 0;
      }
      frame = requestAnimationFrame(tick);
    }
    function fit(immediate = false) {
      if (sizing) return;
      const { width, height } = latest.current;
      const scale = Math.max(.2, Math.min(1, (host!.clientWidth - 112) / width, (host!.clientHeight - 144) / height));
      transition({ x: 32 + (host!.clientWidth - 32 - width * scale) / 2, y: 34 + (host!.clientHeight - 34 - height * scale) / 2 - 12, scale }, immediate);
    }
    function zoom(value: number, anchor = { x: (host!.clientWidth + 32) / 2, y: (host!.clientHeight + 34) / 2 }) {
      if (!Number.isFinite(value) || pan || sizing) return;
      const scale = clampScale(value); if (scale === target.scale) return;
      transition({ x: anchor.x - (anchor.x - view.x) / view.scale * scale, y: anchor.y - (anchor.y - view.y) / view.scale * scale, scale });
    }
    function finish(cancel = false) {
      const state = pan; if (!state) return;
      pan = null; host!.removeAttribute('data-panning');
      if (host!.hasPointerCapture(state.pointer)) host!.releasePointerCapture(state.pointer);
      if (cancel) { view = { ...state.start }; target = { ...view }; paint(); }
    }
    function finishSize(cancel = false) {
      const state = sizing; if (!state) return;
      sizing = null; host!.removeAttribute('data-resizing');
      if (state.button.hasPointerCapture(state.pointer)) state.button.releasePointerCapture(state.pointer);
      if (cancel && (state.last.width !== state.before.width || state.last.height !== state.before.height)) {
        pendingSize = state.before; state.config.onChange(state.before);
      }
      state.config.onInteractionEnd?.();
    }
    function changeSize(config: ArtboardResize, before: ArtboardSize, axis: keyof ArtboardSize, delta: number) {
      const min = axis === 'width' ? config.minWidth : config.minHeight, max = axis === 'width' ? config.maxWidth : config.maxHeight;
      return { ...before, [axis]: Math.max(min, Math.min(max, before[axis] + Math.round(delta / GRID_STEP) * GRID_STEP)) };
    }
    function syncSize() {
      const current = latest.current;
      const scopeChanged = sizing && sizing.config.scope !== current.artboardResize?.scope;
      if (sizing && (scopeChanged || !current.artboardResize || current.artboardResize.disabled)) finishSize(true);
      const own = pendingSize?.width === current.width && pendingSize?.height === current.height;
      if (dimensions.width !== current.width || dimensions.height !== current.height || scopeChanged) {
        dimensions = { width: current.width, height: current.height };
        // Device/dimension changes previously initialized the camera synchronously.
        // Keep handles stationary before the next pointer gesture on the new composition.
        if (!sizing && !own) fit(true);
      }
      pendingSize = null;
    }
    function down(event: PointerEvent) {
      if (sizing) { event.preventDefault(); return; }
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-artboard-resize]') : null;
      if (button && event.button === 0) {
        const config = latest.current.artboardResize; if (!config || config.disabled || !event.isPrimary || pan) return;
        event.preventDefault(); event.stopPropagation(); stopAnimation(); button.focus({ preventScroll: true });
        const axis = button.dataset.artboardResize as keyof ArtboardSize, before = { width: latest.current.width, height: latest.current.height };
        sizing = { axis, pointer: event.pointerId, button, start: axis === 'width' ? event.clientX : event.clientY, scale: view.scale, before, last: before, config };
        button.setPointerCapture(event.pointerId); host!.setAttribute('data-resizing', axis); config.onInteractionStart?.(); return;
      }
      if (event.button !== 1) { if (event.button === 0) stopAnimation(); return; }
      event.preventDefault(); event.stopPropagation(); stopAnimation();
      host!.setAttribute('data-pointer-focus', '');
      host!.focus({ preventScroll: true }); host!.setPointerCapture(event.pointerId);
      pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...view } }; host!.setAttribute('data-panning', '');
    }
    function move(event: PointerEvent) {
      if (sizing?.pointer === event.pointerId) {
        event.preventDefault(); event.stopPropagation();
        const state = sizing, position = state.axis === 'width' ? event.clientX : event.clientY;
        const next = changeSize(state.config, state.before, state.axis, (position - state.start) / state.scale);
        if (next.width !== state.last.width || next.height !== state.last.height) { state.last = next; pendingSize = next; state.config.onChange(next); }
        return;
      }
      if (!pan || event.pointerId !== pan.pointer) return;
      event.preventDefault(); event.stopPropagation();
      if (!(event.buttons & 4)) { finish(); return; }
      view = { ...pan.start, x: pan.start.x + event.clientX - pan.x, y: pan.start.y + event.clientY - pan.y }; target = { ...view }; paint();
    }
    function up(event: PointerEvent) {
      if (sizing?.pointer === event.pointerId) { event.preventDefault(); event.stopPropagation(); finishSize(event.type === 'pointercancel'); return; }
      if (pan?.pointer === event.pointerId) { event.preventDefault(); event.stopPropagation(); finish(event.type === 'pointercancel'); }
    }
    function lostCapture(event: PointerEvent) {
      if (sizing?.pointer === event.pointerId && event.target === sizing.button) finishSize(true);
      if (event.target === host) finish();
    }
    function blur() { finish(); finishSize(true); host!.removeAttribute('data-pointer-focus'); }
    function aux(event: MouseEvent) { if (event.button === 1) event.preventDefault(); }
    function wheel(event: WheelEvent) {
      event.preventDefault(); if (pan || sizing || event.buttons) return;
      const area = host!.getBoundingClientRect(); const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host!.clientHeight : 1;
      zoom(target.scale * Math.exp(-event.deltaY * units * .002), { x: event.clientX - area.left, y: event.clientY - area.top });
    }
    function key(event: KeyboardEvent) {
      if (sizing) { event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') finishSize(true); return; }
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-artboard-resize]') : null;
      if (button) {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const config = latest.current.artboardResize; if (!config || config.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
        const axis = button.dataset.artboardResize as keyof ArtboardSize;
        const direction = axis === 'width' ? ({ ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[event.key] : ({ ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[event.key];
        if (!direction) return;
        event.preventDefault(); event.stopPropagation(); stopAnimation();
        const before = { width: latest.current.width, height: latest.current.height }, next = changeSize(config, before, axis, direction * GRID_STEP * (event.shiftKey ? 10 : 1));
        if (next.width === before.width && next.height === before.height) return;
        pendingSize = next; config.onInteractionStart?.(); config.onChange(next); config.onInteractionEnd?.(); return;
      }
      if (event.target === host) host!.removeAttribute('data-pointer-focus');
      if (event.key === 'Escape' && pan) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
      if (event.target !== host || event.ctrlKey || event.metaKey || event.altKey) return;
      const delta: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (delta[event.key]) { event.preventDefault(); event.stopPropagation(); stopAnimation(); const [x, y] = delta[event.key]; const step = event.shiftKey ? 120 : 40; view = { ...view, x: view.x + x * step, y: view.y + y * step }; target = { ...view }; paint(); }
      else if (event.key === '+' || event.key === '=' || event.key === '-') { event.preventDefault(); zoom(target.scale + (event.key === '-' ? -.1 : .1)); }
      else if (event.key === 'Home') { event.preventDefault(); fit(); }
    }
    let areaWidth = host.clientWidth, areaHeight = host.clientHeight;
    const resize = new ResizeObserver(() => {
      if (host.clientWidth === areaWidth && host.clientHeight === areaHeight) return;
      areaWidth = host.clientWidth; areaHeight = host.clientHeight; if (!pan && !sizing) fit();
    }); resize.observe(host);
    host.addEventListener('pointerdown', down, true); host.addEventListener('pointermove', move, true); host.addEventListener('pointerup', up, true); host.addEventListener('pointercancel', up, true);
    host.addEventListener('lostpointercapture', lostCapture); host.addEventListener('auxclick', aux); host.addEventListener('wheel', wheel, { passive: false }); host.addEventListener('keydown', key);
    host.addEventListener('blur', blur); window.addEventListener('blur', blur); fit(true);
    host.tabIndex = 0; host.setAttribute('aria-busy', 'false');
    controller.current = { fit: () => fit(), setScale: zoom, getScale: () => view.scale, syncSize, destroy: () => {
      host.tabIndex = -1; host.setAttribute('aria-busy', 'true');
      cancelAnimationFrame(frame); finish(); finishSize(true); resize.disconnect();
      host.removeEventListener('pointerdown', down, true); host.removeEventListener('pointermove', move, true); host.removeEventListener('pointerup', up, true); host.removeEventListener('pointercancel', up, true);
      host.removeAttribute('data-pointer-focus'); host.removeEventListener('blur', blur);
      host.removeEventListener('lostpointercapture', lostCapture); host.removeEventListener('auxclick', aux); host.removeEventListener('wheel', wheel); host.removeEventListener('keydown', key); window.removeEventListener('blur', blur);
    } };
    return () => { controller.current?.destroy(); controller.current = null; };
  }, []);
  const rulerStep = Math.max(100, Math.ceil(width / 10000) * 100);
  return <div ref={root} className="ui-editor-viewport" style={{'--ui-editor-grid-step':`${GRID_STEP}px`} as CSSProperties} tabIndex={-1} aria-busy="true" role="region" aria-label={label} aria-describedby={hint} data-file-dragging={fileDragging || undefined}
    onDragEnter={event => { if (!onFilesDrop || !hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); fileDepth.current += 1; if (!fileDropDisabled) setFileDragging(true); }}
    onDragOver={event => { if (!onFilesDrop || !hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = fileDropDisabled ? 'none' : 'copy'; if (!fileDropDisabled) setFileDragging(true); }}
    onDragLeave={() => { if (!onFilesDrop) return; fileDepth.current = Math.max(0, fileDepth.current - 1); if (!fileDepth.current) setFileDragging(false); }}
    onDrop={event => { if (!onFilesDrop || !hasFiles(event)) return; event.preventDefault(); event.stopPropagation(); fileDepth.current = 0; setFileDragging(false); if (!fileDropDisabled) onFilesDrop(Array.from(event.dataTransfer.files), event); }}
    onPointerDown={event => { if (event.button === 0 && !event.defaultPrevented) onMarqueeStart?.(event); }}>
    <p id={hint} className="ui-sr-only">Затисніть колесо миші й рухайте для переміщення. Обертайте колесо для масштабу. З клавіатури: стрілки, Shift для швидшого руху, плюс/мінус, Home для вписування.</p>
    <div className="ui-editor-viewport-world" style={{ width, height }}>{children}</div>
    {artboardResize ? <>
      <p id={`${hint}-resize`} className="ui-sr-only">Тягніть правий або нижній край полотна. Крок сітки — {GRID_STEP} px. Стрілки відповідної осі змінюють розмір на один крок, Shift — на десять. Escape скасовує перетягування.</p>
      <button type="button" className="ui-editor-artboard-edge" data-artboard-resize="width" aria-label="Змінити ширину полотна" aria-describedby={`${hint}-resize`} title={`Ширина полотна: ${width} px · крок ${GRID_STEP} px`} disabled={artboardResize.disabled} style={{ left: `calc(var(--ui-editor-view-x) + ${width}px * var(--ui-editor-view-scale))`, top: 'var(--ui-editor-view-y)', height: `calc(${height}px * var(--ui-editor-view-scale))` }}/>
      <button type="button" className="ui-editor-artboard-edge" data-artboard-resize="height" aria-label="Змінити висоту полотна" aria-describedby={`${hint}-resize`} title={`Висота полотна: ${height} px · крок ${GRID_STEP} px`} disabled={artboardResize.disabled} style={{ top: `calc(var(--ui-editor-view-y) + ${height}px * var(--ui-editor-view-scale))`, left: 'var(--ui-editor-view-x)', width: `calc(${width}px * var(--ui-editor-view-scale))` }}/>
    </> : null}
    {fileDragging ? <div className="ui-editor-file-drop" role="status"><p><ImagePlus size={22} aria-hidden="true"/>{fileDropHint}</p></div> : null}
    {artboardLabel ? <span className="ui-editor-viewport-label" style={{ top: `calc(var(--ui-editor-view-y) + ${height}px * var(--ui-editor-view-scale) + 14px)` }}>{artboardLabel}</span> : null}
    <div className="ui-editor-viewport-ruler ui-editor-viewport-ruler-x" aria-hidden="true">{Array.from({ length: Math.floor(width / rulerStep) + 1 }, (_, index) => <span key={index} style={{ left: `calc(var(--ui-editor-view-x) - 32px + ${index * rulerStep}px * var(--ui-editor-view-scale))` }}>{index * rulerStep}</span>)}</div>
    <div className="ui-editor-viewport-ruler ui-editor-viewport-ruler-y" aria-hidden="true">{Array.from({ length: Math.floor(height / 100) + 1 }, (_, index) => <span key={index} style={{ top: `calc(var(--ui-editor-view-y) - 34px + ${index * 100}px * var(--ui-editor-view-scale))` }}>{index * 100}</span>)}</div>
  </div>;
});
