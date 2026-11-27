'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';
import {Button,ColorInput,Field,IconButton,NumberInput,Select} from './components';
import type {ShapeFillLayer,ShapeUnit} from '@zero/shape-types';
import './shape-style-editor.css';
import {parsePaint,serializePaint} from '@zero/paint.mjs';

export type ShapeColorInteraction={onInteractionStart:()=>void;onInteractionEnd:()=>void};
// Numeric drafts allow intermediate empty/minus/decimal input without saving invalid values.
const formatNumber=(n:number)=>String(Math.round(n*10000)/10000);
export function ShapeNumber({label,value,min=0,max=3000,step=1,onChange}:{label:string;value:number;min?:number;max?:number;step?:number;onChange:(value:number)=>void}){
 const [draft,setDraft]=useState(formatNumber(value)),focused=useRef(false);
 useLayoutEffect(()=>{if(!focused.current)setDraft(formatNumber(value));},[value]);
 return <Field label={label}><NumberInput value={draft} min={min} max={max} step={step} onFocus={()=>{focused.current=true;}} onBlur={()=>{focused.current=false;setDraft(formatNumber(value));}} onChange={event=>{const raw=event.target.value;setDraft(raw);const n=Number(raw);if(raw!==''&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}}/></Field>;
}
export function ShapeUnitInput({label,value,onChange}:{label:string;value:ShapeUnit;onChange:(value:ShapeUnit)=>void}){return <Select label={label} value={value} options={[{value:'%',label:'%'},{value:'px',label:'px'}]} onValueChange={value=>onChange(value as ShapeUnit)}/>;}
export function ShapeFillEditor({value,onChange,colorInteraction}:{value:ShapeFillLayer[];onChange:(value:ShapeFillLayer[])=>void;colorInteraction?:ShapeColorInteraction}){
 function move(index:number,offset:number){const next=[...value];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);}
 return <div className="ui-shape-stack" role="group" aria-label="Шари заливки">
  {value.map((layer,index)=><section className="ui-shape-section" key={index} aria-label={`Шар заливки ${index+1}`}>
   <div className="ui-shape-row"><h4>Шар {index+1}</h4><IconButton label={`Підняти заливку ${index+1}`} icon={<ArrowUp size={16}/>} variant="ghost" disabled={!index} onClick={()=>move(index,-1)}/><IconButton label={`Опустити заливку ${index+1}`} icon={<ArrowDown size={16}/>} variant="ghost" disabled={index===value.length-1} onClick={()=>move(index,1)}/><IconButton label={`Видалити заливку ${index+1}`} icon={<Trash2 size={16}/>} variant="ghost" onClick={()=>onChange(value.filter((_,at)=>at!==index))}/></div>
   <ColorInput {...colorInteraction} label="Колір заливки" value={serializePaint(layer)} onValueChange={color=>{const next=parsePaint(color);if(next)onChange(value.map((item,at)=>at===index?next as ShapeFillLayer:item));}}/>
  </section>)}
  {!value.length?<p className="ui-shape-hint">Без заливки.</p>:null}
  <Button variant="secondary" icon={<Plus size={16}/>} disabled={value.length>=8} onClick={()=>onChange([...value,{type:'solid',color:'#EADDBC'}])}>Додати шар заливки</Button>
 </div>;
}
