'use client';
import { useState } from 'react';
import { Field, NumberInput, Switch } from './components';

export function StyleEdgeInput({label,values,onChange,min=0,max=200,corners=false}:{label:string;values:(number|undefined)[];onChange:(values:(number|undefined)[])=>void;min?:number;max?:number;corners?:boolean}){
  const [linked,setLinked]=useState(values.every(value=>value===values[0]));
  const labels=corners?['Верхній лівий','Верхній правий','Нижній правий','Нижній лівий']:['Зверху','Праворуч','Знизу','Ліворуч'];
  return <div className="ui-style-edges" role="group" aria-label={label}><Switch label={`Зв’язати: ${label}`} checked={linked} onCheckedChange={setLinked}/><div className="ui-style-edges-grid">{labels.map((side,index)=><Field key={side} label={`${label}: ${side}`}><NumberInput value={values[index]??''} min={min} max={max} onChange={event=>{const value=event.target.value===''?undefined:Number(event.target.value);if(value!==undefined&&(!Number.isFinite(value)||value<min||value>max))return;onChange(linked?values.map(()=>value):values.map((prior,at)=>at===index?value:prior));}}/></Field>)}</div></div>;
}
