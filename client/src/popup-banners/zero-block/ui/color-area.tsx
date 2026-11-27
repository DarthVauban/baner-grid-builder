"use client";

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

export type ColorAreaProps = {
  hue: number;
  saturation: number;
  value: number;
  onValueChange: (saturation: number, value: number) => void;
  disabled?: boolean;
  label?: string;
};

function clampPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function ColorArea({ hue, saturation, value, onValueChange, disabled = false, label = "Насиченість і яскравість" }: ColorAreaProps) {
  const helpId = useId();
  const saturationRef = useRef<HTMLInputElement>(null);
  const activePointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const s = clampPercent(saturation);
  const v = clampPercent(value);
  const h = Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0;

  function change(nextSaturation: number, nextValue: number) {
    if (!disabled) onValueChange(clampPercent(nextSaturation), clampPercent(nextValue));
  }

  function changeFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    change((event.clientX - rect.left) / rect.width * 100, (1 - (event.clientY - rect.top) / rect.height) * 100);
  }

  function endPointer(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    if (activePointer.current !== event.pointerId) return;
    if (commit) changeFromPointer(event);
    activePointer.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onAxisKeyDown(event: KeyboardEvent<HTMLInputElement>, axis: "saturation" | "value") {
    if (disabled) return;
    const step = event.shiftKey ? 10 : 1;
    let nextSaturation = s;
    let nextValue = v;
    switch (event.key) {
      case "ArrowRight": nextSaturation += step; break;
      case "ArrowLeft": nextSaturation -= step; break;
      case "ArrowUp": nextValue += step; break;
      case "ArrowDown": nextValue -= step; break;
      case "Home": if (axis === "saturation") nextSaturation = 0; else nextValue = 0; break;
      case "End": if (axis === "saturation") nextSaturation = 100; else nextValue = 100; break;
      case "PageUp": nextValue = 100; break;
      case "PageDown": nextValue = 0; break;
      default: return;
    }
    event.preventDefault();
    change(nextSaturation, nextValue);
  }

  return <div className="ui-color-area" role="group" aria-label={label} aria-describedby={helpId} aria-disabled={disabled || undefined} data-disabled={disabled || undefined} data-dragging={dragging && !disabled || undefined}
    style={{ "--color-area-hue": `hsl(${h} 100% 50%)`, "--color-area-saturation": `${s}%`, "--color-area-top": `${100 - v}%` } as CSSProperties}
    onPointerDown={(event) => {
      if (disabled || activePointer.current !== null || (event.pointerType !== "touch" && event.button !== 0)) return;
      event.preventDefault();
      activePointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      saturationRef.current?.focus({ preventScroll: true });
      setDragging(true);
      changeFromPointer(event);
    }}
    onPointerMove={(event) => {
      if (activePointer.current !== event.pointerId) return;
      if (disabled) endPointer(event, false);
      else changeFromPointer(event);
    }}
    onPointerUp={(event) => endPointer(event, true)}
    onPointerCancel={(event) => endPointer(event, false)}
    onLostPointerCapture={(event) => {
      if (activePointer.current === event.pointerId) {
        activePointer.current = null;
        setDragging(false);
      }
    }}>
    <span className="ui-color-area-thumb" aria-hidden="true" />
    <input ref={saturationRef} className="ui-color-area-axis" type="range" min={0} max={100} step="any" value={s} disabled={disabled} aria-label="Насиченість" aria-valuetext={`${Math.round(s)} %`} aria-orientation="horizontal" aria-describedby={helpId} onChange={(event) => change(Number(event.target.value), v)} onKeyDown={(event) => onAxisKeyDown(event, "saturation")} />
    <input className="ui-color-area-axis" type="range" min={0} max={100} step="any" value={v} disabled={disabled} aria-label="Яскравість" aria-valuetext={`${Math.round(v)} %`} aria-orientation="vertical" aria-describedby={helpId} onChange={(event) => change(s, Number(event.target.value))} onKeyDown={(event) => onAxisKeyDown(event, "value")} />
    <span className="ui-color-area-help" id={helpId}>Ліворуч і праворуч — насиченість. Угору й униз — яскравість. Shift збільшує крок до 10. Home і End — межі поточної осі. Page Up — максимальна яскравість, Page Down — мінімальна.</span>
  </div>;
}
