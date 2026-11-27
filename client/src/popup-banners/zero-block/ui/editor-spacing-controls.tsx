'use client';

import {useRef, useState} from 'react';
import {BetweenHorizontalStart, BetweenVerticalStart} from 'lucide-react';
import {Field, NumberInput, Slider} from './components';

export type SpacingAxis = 'x' | 'y';
type SpacingValue = {value:number|null; min:number; max:number; disabled?:boolean};
type Props = {x:SpacingValue; y:SpacingValue; disabled?:boolean; onValueChange:(axis:SpacingAxis,value:number)=>void; onInteractionStart?:(axis:SpacingAxis)=>void; onInteractionEnd?:()=>void};

function SpacingField({axis, model, disabled, onValueChange, onInteractionStart, onInteractionEnd}: Omit<Props,'x'|'y'> & {axis:SpacingAxis; model:SpacingValue}) {
  const [draft,setDraft] = useState<string|null>(null), dirty = useRef(false);
  const label = axis === 'x' ? 'По горизонталі, px' : 'По вертикалі, px', Icon = axis === 'x' ? BetweenHorizontalStart : BetweenVerticalStart;
  const unavailable = disabled || model.disabled || model.min > model.max;
  const commit = () => {
    if (dirty.current && draft?.trim() && Number.isFinite(Number(draft)) && !unavailable) {
      const value = Math.max(model.min,Math.min(model.max,Number(draft)));
      onInteractionStart?.(axis); onValueChange(axis,value); onInteractionEnd?.();
    }
    dirty.current = false; setDraft(null);
  };
  const value = model.value ?? 0, min = Math.max(model.min, Math.min(-100,value)), max = Math.min(model.max,Math.max(500,value));
  return <div className="ui-editor-spacing-field">
    <Field label={<span className="ui-editor-spacing-label"><Icon size={20} strokeWidth={1.75} aria-hidden="true"/>{label}</span>}>
      <NumberInput min={model.min} max={model.max} step="any" disabled={unavailable} placeholder="Різні" value={draft ?? (model.value === null ? '' : String(model.value))}
        onFocus={() => {dirty.current=false;setDraft(model.value === null ? '' : String(model.value));}}
        onChange={event => {dirty.current=true;setDraft(event.target.value);}} onBlur={commit}
        onKeyDown={event => {if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dirty.current=false;setDraft(null);event.currentTarget.blur();}}}/>
    </Field>
    <Slider compact label={`${label} — повзунок`} min={min} max={Math.max(min,max)} value={Math.max(min,Math.min(max,value))} step={1} disabled={unavailable || min === max} onInteractionStart={() => onInteractionStart?.(axis)} onValueChange={value => onValueChange(axis,value)} onInteractionEnd={onInteractionEnd}/>
  </div>;
}

export function EditorSpacingControls({x,y,...props}:Props) {
  return <div className="ui-editor-spacing-controls" role="group" aria-label="Відступи між елементами">
    <SpacingField axis="x" model={x} {...props}/><SpacingField axis="y" model={y} {...props}/>
  </div>;
}
