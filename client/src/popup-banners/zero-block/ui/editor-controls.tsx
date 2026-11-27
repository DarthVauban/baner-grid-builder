'use client';

import { useId, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { IconButton } from './components';

export function EditorSegments({ label, value, items, onValueChange, surface = 'dark' }: {
  label: string; value: string; items: readonly { value: string; label: string; icon?: ReactNode; disabled?: boolean }[]; onValueChange: (value: string) => void; surface?: 'dark' | 'light';
}) {
  const root = useRef<HTMLDivElement>(null);
  return <div ref={root} className={`ui-editor-segments${surface === 'light' ? ' ui-editor-segments--light' : ''}`} role="group" aria-label={label}>{items.map((item) => <button key={item.value} type="button" aria-pressed={item.value === value} disabled={item.disabled} onClick={() => onValueChange(item.value)} onKeyDown={(event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const enabled = items.filter((part) => !part.disabled); const index = enabled.findIndex((part) => part.value === item.value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
    onValueChange(enabled[next].value); root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')[next]?.focus();
  }}>{item.icon}<span>{item.label}</span></button>)}</div>;
}

export function EditorPaletteItem({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="ui-editor-palette-item" onClick={onClick} disabled={disabled}><span aria-hidden="true">{icon}</span><span>{label}</span></button>;
}

export function EditorSelectionCard({ title, description = 'Вибраний елемент', icon, action }: { title: string; description?: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="ui-editor-selection-card"><span className="ui-editor-selection-icon" aria-hidden="true">{icon}</span><div><strong>{title}</strong><span>{description}</span></div>{action}</div>;
}

export function EditorZoomControl({ value, onValueChange, onFit }: { value: number; onValueChange: (value: number) => void; onFit: () => void }) {
  return <div className="ui-editor-zoom"><div className="ui-editor-zoom-steps" role="group" aria-label="Масштаб полотна"><IconButton label="Зменшити масштаб" icon={<Minus size={16}/>} variant="chrome" disabled={value <= .2} onClick={() => onValueChange(Math.max(.2, Math.round((value - .1) * 100) / 100))}/><output aria-label="Масштаб">{Math.round(value * 100)}%</output><IconButton label="Збільшити масштаб" icon={<Plus size={16}/>} variant="chrome" disabled={value >= 1.5} onClick={() => onValueChange(Math.min(1.5, Math.round((value + .1) * 100) / 100))}/></div><IconButton label="Вписати полотно" icon={<Maximize size={17}/>} variant="chrome" onClick={onFit}/></div>;
}

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export function EditorSelectionOutline({ box, variant = 'bounds' }: { box: { x: number; y: number; width: number; height: number }; variant?: 'bounds' | 'member' | 'marquee' }) {
  return <div className="ui-editor-selection-outline" data-variant={variant} aria-hidden="true" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}/>;
}
const handleNames: Record<ResizeHandle, string> = { n: 'верхня грань', ne: 'верхній правий кут', e: 'права грань', se: 'нижній правий кут', s: 'нижня грань', sw: 'нижній лівий кут', w: 'ліва грань', nw: 'верхній лівий кут' };
export function EditorSelectionFrame({ box, onResizeStart, onResizeKey, label = 'Змінити розмір', hint, handles, rotation = 0, variant = 'default' }: { box: { x: number; y: number; width: number; height: number }; onResizeStart: (handle: ResizeHandle, event: PointerEvent<HTMLButtonElement>) => void; onResizeKey: (handle: ResizeHandle, event: KeyboardEvent<HTMLButtonElement>) => void; label?: string; hint?: string; handles?:ResizeHandle[]; rotation?:number; variant?:'default'|'form' }) {
  const hintId = useId();
  return <div className={`ui-editor-selection-frame${variant==='form'?' ui-editor-selection-frame--form':''}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height, transform:rotation?`rotate(${rotation}deg)`:undefined,transformOrigin:'center' } as CSSProperties}>{hint ? <span id={hintId} className="ui-sr-only">{hint}</span> : null}{(handles||(Object.keys(handleNames) as ResizeHandle[])).map((handle) => <button key={handle} type="button" className="ui-editor-resize-handle" data-handle={handle} aria-label={`${label}: ${handleNames[handle]}`} aria-describedby={hint ? hintId : undefined} onPointerDown={(event) => onResizeStart(handle, event)} onKeyDown={(event) => onResizeKey(handle, event)}/>)}</div>;
}
