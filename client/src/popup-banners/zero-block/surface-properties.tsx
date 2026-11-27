'use client';

import { ColorInput, Field, NumberInput, Switch } from './ui/components';
import { defaultCorners, defaultShadow } from '@zero/document.mjs';
import type { Composition, Corners, PopupShadow } from './types';

const cornerFields: readonly [keyof Corners, string][] = [
  ['topLeft', 'Верхній лівий'], ['topRight', 'Верхній правий'], ['bottomLeft', 'Нижній лівий'], ['bottomRight', 'Нижній правий'],
];
const shadowFields: readonly [keyof Pick<PopupShadow, 'x' | 'y' | 'blur' | 'spread'>, string, number, number][] = [
  ['x', 'Зміщення тіні X', -200, 200], ['y', 'Зміщення тіні Y', -200, 200], ['blur', 'Розмиття тіні', 0, 200], ['spread', 'Розширення тіні', -100, 100],
];
export function SurfaceProperties({ composition, onChange, colorInteraction }: { colorInteraction: { onInteractionStart: () => void; onInteractionEnd: () => void }; composition: Composition; onChange: (patch: Partial<Composition>) => void }) {
  const corners = composition.corners || defaultCorners();
  const shadow = composition.shadow || defaultShadow();
  return <>
    <section className="builder-property-section" aria-label="Кути поп-апа"><h3>Заокруглення кутів, px</h3><div className="builder-property-grid">{cornerFields.map(([key, label]) => <Field key={key} label={label}><NumberInput min={0} max={999} value={corners[key]} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 999) onChange({ corners: { ...corners, [key]: value } }); }}/></Field>)}</div></section>
    <section className="builder-property-section" aria-label="Тінь поп-апа"><Switch label="Тінь поп-апа" checked={shadow.enabled} onCheckedChange={enabled => onChange({ shadow: { ...shadow, enabled } })}/>{shadow.enabled ? <><div className="builder-property-grid">{shadowFields.map(([key, label, min, max]) => <Field key={key} label={label}><NumberInput min={min} max={max} value={shadow[key]} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= min && value <= max) onChange({ shadow: { ...shadow, [key]: value } }); }}/></Field>)}</div><ColorInput {...colorInteraction} label="Колір тіні" value={shadow.color} onValueChange={color => onChange({ shadow: { ...shadow, color } })}/></> : null}</section>
  </>;
}
