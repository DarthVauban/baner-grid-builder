'use client';
import {useState} from 'react';
import {Field,NumberInput} from './ui/components';
import {selectionPosition} from '@zero/selection-layout.mjs';
import type {PopupDocument} from './types';

type Axis = 'x'|'y';
export function SelectionPositionProperties({document,ids,device,disabled,onChange}:{document:PopupDocument;ids:string[];device:'desktop'|'mobile';disabled:boolean;onChange:(axis:Axis,value:number)=>void}) {
  const [draft,setDraft]=useState<{axis:Axis;value:string;dirty:boolean}|null>(null),model=selectionPosition(document,ids,device);
  if(!model)return null;
  const shown=(value:number)=>String(Math.round(value*1000)/1000);
  const commit=(axis:Axis)=>{
    if(draft?.axis===axis&&draft.dirty&&draft.value.trim()&&Number.isFinite(Number(draft.value))&&!disabled&&!model.disabled)onChange(axis,Math.max(model[axis].min,Math.min(model[axis].max,Number(draft.value))));
    setDraft(null);
  };
  return <section className="builder-property-section" aria-label="Положення вибору"><h3>Положення</h3><div className="builder-property-grid">{(['x','y'] as const).map(axis=><Field key={axis} label={axis.toUpperCase()}>
    <NumberInput min={model[axis].min} max={model[axis].max} step="any" disabled={disabled||model.disabled} value={draft?.axis===axis?draft.value:shown(model[axis].value)}
      onFocus={()=>setDraft({axis,value:shown(model[axis].value),dirty:false})} onChange={event=>setDraft({axis,value:event.target.value,dirty:true})} onBlur={()=>commit(axis)}
      onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDraft(null);}}}/>
  </Field>)}</div></section>;
}
